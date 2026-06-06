import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/* ───────── products ───────── */
@Schema({ _id: false })
export class SizeOpt {
  @Prop() id: string;
  @Prop() name: string;
  @Prop() position: number;
}

@Schema({ _id: false })
export class ColorOpt {
  @Prop() id: string;
  @Prop() name: string;
  @Prop() value: string;
  @Prop() position: number;
}

@Schema({ _id: false })
export class Range {
  @Prop() min: number;
  @Prop() max: number;
}

@Schema({ _id: false })
export class ProductPartner {
  @Prop() partner_id: string;
  @Prop() partner_name: string;
}

@Schema({ collection: 'products', timestamps: true })
export class Product extends Document<string> {
  @Prop({ type: String, required: true, primaryKey: true })
  _id: string;

  @Prop({ required: true, unique: true, index: true })
  shortCode: string; // "EUG2400" (khóa nối)

  @Prop({ required: true, unique: true, index: true })
  aliasName: string; // gọi DETAIL

  @Prop()
  externalId: string; // "id" từ list

  @Prop({ required: true })
  name: string;

  @Prop()
  displayName: string;

  @Prop()
  mockup: string;

  @Prop()
  currency: string; // "USD"

  @Prop()
  designGroup: string; // "shirt"

  // lọc / phân loại
  @Prop({ index: true })
  region: string; // "US" | "EU" (từ shortCode prefix + htmlDesc + titleSuffix)

  @Prop({ index: true })
  productCategory: string; // chuẩn hoá nội bộ: "apparel"|"home"|...

  @Prop({ type: [String], index: true })
  categories: string[]; // từ catalogObjects: "Men's T-shirts"...

  @Prop({ type: [String], index: true })
  sellingPlatforms: string[]; // "Amazon","Etsy","Shopify","Walmart"...

  @Prop({ type: [String] })
  shippingTiers: string[]; // "Express","Standard","Economy"...

  @Prop({ type: [String] })
  collections: string[]; // "Best Sellers","Seasonal Favorites"

  @Prop({ index: true })
  brand: string; // "Bella+Canvas","Gildan"

  @Prop({ type: [String], index: true })
  techniques: string[]; // ["DTG","DTF"] (từ decorations)

  @Prop({ type: [String] })
  printAreas: string[]; // ["Front","Back","Left Sleeve / Right Sleeve"]

  // popularity / giá gợi ý / time
  @Prop({ index: true })
  revenue: number; // popularity (null→0)

  @Prop()
  dropshipPriceMin: number;

  @Prop()
  dropshipPriceMax: number;

  @Prop({ type: Range })
  productionTime: Range; // {min,max} từ "1-3"

  @Prop({ type: Range })
  shippingTimeUs: Range; // từ shipping.shippingTimeUs "3-9"

  @Prop({ type: Range })
  shippingTimeWW: Range; // từ shipping.shippingTimeWw "7-15"

  @Prop()
  countColors: number;

  @Prop()
  isNew: boolean;

  @Prop()
  createdDate: Date; // [y,m,d] → Date

  @Prop({ type: [SizeOpt] })
  sizes: SizeOpt[];

  @Prop({ type: [ColorOpt] })
  colors: ColorOpt[];

  @Prop({ type: [ProductPartner] })
  partners: ProductPartner[];

  // search + sync
  @Prop()
  searchText: string; // name+alias+desc + keywords VN/EN (text index)

  @Prop({ default: false })
  detailFetched: boolean;

  @Prop()
  syncedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ searchText: 'text' });
