import { CACHE_MANAGER, Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Listing, ListingDocument } from './schemas/lisitng.schema';
import { Model } from 'mongoose';
import { CreateListingDto } from './DTO/create-listing.dto';
import { ClientProxy } from '@nestjs/microservices';
import { Contract } from 'web3-eth-contract';
import { ConfigService } from '@nestjs/config';
import Web3 from 'web3';
import mintNftContract from './contracts/MyNFT.json';
import sellNftContract from './contracts/sellNFT.json';
import { AbiItem } from 'web3-utils';
import { Cache } from 'cache-manager';
import {
  signTypedData,
  SignTypedDataVersion,
  TypedMessage,
  MessageTypes,
} from '@metamask/eth-sig-util';
import { Sale, SaleDocument } from './schemas/sale.schema';

@Injectable()
export class PaymentsService {
  private mintContract: Contract;
  private sellContract: Contract;
  private readonly private_key: string; // private key of wallet which deploys the smart contract.
  private readonly mint_contract_address: string; // address of the ERC721 contract
  private readonly sell_contract_address: string; // address on contract which carries out transactions between users
  private readonly public_key: string; // public key of the wallet that deploys the smart contract
  private web3: Web3;

  constructor(
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
    @InjectModel(Sale.name) private saleModel: Model<SaleDocument>,
    @Inject('PRODUCTS_SERVICE') private products_microservice: ClientProxy,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.private_key = this.configService.get<string>('PRIVATE_KEY');
    this.mint_contract_address = this.configService.get<string>(
      'MINT_CONTRACT_ADDRESS',
    );
    this.sell_contract_address = this.configService.get<string>(
      'SELL_CONTRACT_ADDRESS',
    );
    this.public_key = this.configService.get<string>('PUBLIC_KEY');
    this.web3 = new Web3(this.configService.get('API_URL'));

    this.mintContract = new this.web3.eth.Contract(
      mintNftContract.abi as AbiItem[],
      this.mint_contract_address,
    );

    this.sellContract = new this.web3.eth.Contract(
      sellNftContract.abi as AbiItem[],
      this.sell_contract_address,
    );

    this.sellContract.events.Sold().on('data', (event) => {
      const values = event.returnValues;

      const from = values.from;
      const to = values.to;
      const item_id = values.tokenID.toString();
      const amount = values.amount;

      const sale = new this.saleModel({
        item_id: item_id,
        price: amount,
        seller: from,
        buyer: to,
      });

      sale.save();
      /* Work In Progress
       **  - Delete Listing
       **  - Update owner
       */
      this.listingModel.deleteOne({ item_id: item_id });
      this.products_microservice
        .send({ cmd: 'update-owner' }, { item_id: item_id, owner: to })
        .subscribe();
    });
  }

  private async generateSign(
    listing: ListingDocument,
    buyer: string,
    deadline: number,
  ) {
    const domain = [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ];

    const sellNft = [
      { name: 'sender', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ];

    const domainData = {
      name: 'Desi-NFT',
      version: '0.0.1',
      chainId: await this.web3.eth.net.getId(),
      verifyingContract: this.sell_contract_address,
    };

    const message = {
      sender: buyer,
      amount: listing.price,
      tokenId: listing.item_id,
      deadline: deadline,
    };

    const data: TypedMessage<MessageTypes> = {
      types: {
        EIP712Domain: domain,
        sellNft: sellNft,
      },
      domain: domainData,
      primaryType: 'sellNft',
      message: message,
    };

    return signTypedData({
      privateKey: Buffer.from(this.private_key, 'hex'),
      data: data,
      version: SignTypedDataVersion.V3,
    });
  }

  async fillListing(listing_id: string, buyer: string) {
    const listing: ListingDocument = await this.listingModel
      .findOne({ _id: listing_id })
      .exec();
    if (listing) {
      const deadline = Date.now() + 5 * 60 * 1000;

      const signed = (
        await this.generateSign(listing, buyer, deadline)
      ).substring(2);

      const tx = {
        from: buyer,
        to: this.sell_contract_address,
        data: this.sellContract.methods
          .sellNft(
            listing.price,
            listing.item_id,
            deadline,
            parseInt(signed.substring(128, 130), 16),
            `0x${signed.substring(0, 64)}`,
            `0x${signed.substring(64, 128)}`,
          )
          .encodeABI(),
      };

      return { tx: tx };
    } else throw new Error('No Listing Found');
  }

  createListing(listing: CreateListingDto): Promise<any> {
    return new Promise(async (resolve, reject) => {
      this.products_microservice
        .send<string>({ cmd: 'get-nft' }, [
          { item_id: listing.item_id },
          'owner',
        ])
        .subscribe(async (owner) => {
          if (owner !== listing.createdBy)
            reject('You should be the owner of the NFT');
          else if (listing.expiresAt > Date.now() + 30 * 24 * 60 * 60 * 1000)
            reject('Expiration Date Should Be Within 30 Days');
          else if (
            await this.listingModel.findOne({ item_id: listing.item_id }).exec()
          ) {
            reject('Similar listing found');
          } else {
            this.mintContract.methods
              .isApprovedForAll(listing.createdBy, this.sell_contract_address)
              .call({ from: this.public_key }, (error, isApproved) => {
                if (error) reject(error);
                else if (!isApproved) {
                  resolve({
                    tx: {
                      from: owner,
                      to: this.mint_contract_address,
                      data: this.mintContract.methods
                        .setApprovalForAll(this.sell_contract_address, true)
                        .encodeABI(),
                    },
                  });
                } else {
                  const new_listing = new this.listingModel(listing);
                  new_listing.save();

                  resolve({ id: new_listing._id.toString() });
                }
              });
          }
        });
    });
  }
}
