import { Optional } from '@nestjs/common';
import { IsNotEmpty } from 'class-validator';

export class CreateListingDto {
  @IsNotEmpty()
  item_id: string;

  @IsNotEmpty()
  price: string;

  @IsNotEmpty()
  createdBy: string;

  @Optional()
  expiresAt: number;
}
