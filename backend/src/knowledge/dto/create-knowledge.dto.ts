import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateKnowledgeDto {
  @ApiPropertyOptional({
    description:
      'Optional title; defaults to the first heading or the file name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Markdown guide content (required when not uploading a file).',
  })
  @IsOptional()
  @IsString()
  content?: string;
}
