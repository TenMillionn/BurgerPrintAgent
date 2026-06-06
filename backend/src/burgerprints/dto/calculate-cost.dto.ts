import { IsString, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CalculateItemDto {
  @IsString()
  @IsNotEmpty()
  catalog_sku: string;
}

export class CalculateCostDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculateItemDto)
  items: CalculateItemDto[];

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  state: string;
}
