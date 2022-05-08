import {
  Controller,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { PaymentsService } from './app.service';
import { CreateListingDto } from './DTO/create-listing.dto';

@Controller()
export class AppController {
  constructor(private paymentsService: PaymentsService) {}

  @UseInterceptors(ClassSerializerInterceptor)
  @MessagePattern({ cmd: 'create-listing' })
  async createListing(listing: CreateListingDto) {
    try {
      return await this.paymentsService.createListing(listing);
    } catch (err) {
      throw new RpcException(err);
    }
  }

  @UseInterceptors(ClassSerializerInterceptor)
  @MessagePattern({ cmd: 'fill-listing' })
  async fillListing(sale) {
    try {
      return await this.paymentsService.fillListing(
        sale.listing_id,
        sale.buyer,
      );
    } catch (err) {
      console.log(err);
      throw new RpcException(err);
    }
  }
}
