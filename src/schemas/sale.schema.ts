import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SaleDocument = Sale & Document;

@Schema()
export class Sale {
  @Prop({ required: true, immutable: true })
  item_id: number;

  @Prop({ required: true })
  price: number;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ required: true })
  seller: string;

  @Prop({ required: true })
  buyer: string;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
SaleSchema.index({ item_id: 1 });
