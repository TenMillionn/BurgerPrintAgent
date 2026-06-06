import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  StringField,
  StringFieldOptional,
} from '../../../common/decorators/field.decorators';

export enum ShippingMethod {
  ECONOMY = 'economy',
  STANDARD = 'standard',
  EXPRESS = 'express',
  PRIORITY_EXPRESS = 'priority express',
}

export enum ProductionService {
  PRIORITY = 'Priority',
}

export enum AdditionalService {
  PROACTIVE_TRACKING = 'ProActive Tracking',
}

export class ShippingDto {
  @StringFieldOptional()
  name?: string;

  @StringFieldOptional()
  address1?: string;

  @StringFieldOptional()
  address2?: string;

  @StringFieldOptional()
  city?: string;

  @StringFieldOptional()
  state?: string;

  @StringFieldOptional()
  zip?: string;

  @StringField()
  country!: string;

  @StringFieldOptional()
  email?: string;

  @StringFieldOptional()
  phone?: string;
}

export class OrderItemDto {
  @StringFieldOptional()
  catalog_sku?: string;

  @StringFieldOptional()
  product_id?: string;

  @StringFieldOptional()
  variant_id?: string;

  @ApiProperty()
  @IsNumber()
  quantity!: number;

  @StringFieldOptional()
  design_url_front?: string;

  @StringFieldOptional()
  design_url_back?: string;

  @StringFieldOptional()
  design_url_sleeve?: string;

  @StringFieldOptional()
  mockup_url_front?: string;

  @StringFieldOptional()
  mockup_url_back?: string;

  @StringFieldOptional()
  mockup_url_sleeve?: string;

  @StringFieldOptional()
  reference_item_id?: string;
}

export class CreateOrderPayload {
  @ApiProperty({ type: () => ShippingDto })
  @ValidateNested()
  @Type(() => ShippingDto)
  shipping!: ShippingDto;

  @ApiPropertyOptional({ enum: ShippingMethod })
  @IsOptional()
  @IsEnum(ShippingMethod)
  shipping_method?: ShippingMethod;

  @ApiPropertyOptional({ enum: ProductionService })
  @IsOptional()
  @IsEnum(ProductionService)
  production_service?: ProductionService;

  @ApiPropertyOptional({ enum: AdditionalService })
  @IsOptional()
  @IsEnum(AdditionalService)
  additional_service?: AdditionalService;

  @StringFieldOptional()
  callback_url?: string;

  @StringFieldOptional()
  shipping_label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sandbox?: boolean;

  @StringFieldOptional()
  fulfillment_partner?: string;

  @StringFieldOptional()
  reference_order_id?: string;

  @ApiProperty({ type: () => [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
