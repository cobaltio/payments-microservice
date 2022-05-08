import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ListingDocument = Listing & Document;

@Schema()
export class Listing {
  @Prop({ required: true, immutable: true })
  item_id: string;

  @Prop({ required: true })
  price: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  expiresAt: Date;
}

export const ListingSchema = SchemaFactory.createForClass(Listing);
ListingSchema.index({ item_id: 1 }, { unique: true });
ListingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
