import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Range } from './product.schema';

@Schema({ collection: 'shipping_rates', timestamps: true })
export class ShippingRate extends Document {
  @Prop({ required: true, index: true })
  productShortCode: string;

  @Prop({ required: true, index: true })
  partnerId: string;

  @Prop({ required: true, index: true })
  countryCode: string; // "DE"

  @Prop()
  countryName: string;

  @Prop()
  method: string; // "standard"

  @Prop()
  methodName: string; // "Standard"

  @Prop({ type: Range })
  days: Range; // "5-10 business days" → {5,10}

  @Prop()
  daysRaw: string;

  @Prop({ type: [String] })
  carriers: string[];

  @Prop({ required: true, index: true, type: Number })
  firstItemPrice: number; // "5.99" → 5.99

  @Prop({ type: Number })
  additionalItemPrice: number; // "1.19"

  @Prop()
  syncedAt: Date;
}

export const ShippingRateSchema = SchemaFactory.createForClass(ShippingRate);

ShippingRateSchema.index(
  { productShortCode: 1, partnerId: 1, countryCode: 1, method: 1 },
  { unique: true },
);
