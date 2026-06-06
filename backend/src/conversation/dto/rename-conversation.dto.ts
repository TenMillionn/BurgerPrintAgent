import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RenameConversationDto {
  @ApiProperty({ example: 'US tees under $8', minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title!: string;
}
