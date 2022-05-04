import { IsNotEmpty } from 'class-validator';

export class CreateSaleDto {
  @IsNotEmpty()
  item_id: number;

  @IsNotEmpty()
  price: number;

  @IsNotEmpty()
  seller: string;

  @IsNotEmpty()
  buyer: string;
}
