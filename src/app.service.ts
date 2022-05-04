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
import { AbiItem } from 'web3-utils';
import { Cache } from 'cache-manager';

@Injectable()
export class PaymentsService {
  private mintContract: Contract;
  private readonly private_key: string; // private key of wallet which deploys the smart contract.
  private readonly mint_contract_address: string; // address of the ERC721 contract
  private readonly sell_contract_address: string; // address on contract which carries out transactions between users
  private readonly public_key: string; // public key of the wallet that deploys the smart contract
  private web3: Web3;

  constructor(
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
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
