import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';

/**
 * Admin-only knowledge base management. The global JwtAuthGuard authenticates;
 * RolesGuard + @Roles('admin') restricts to admins (non-admin → 403).
 */
@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('knowledge')
@UseGuards(RolesGuard)
@Roles('admin')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** Create a guide from pasted Markdown (JSON) OR an uploaded .md file (multipart). */
  @Post()
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() dto: CreateKnowledgeDto,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const content = file ? file.buffer.toString('utf-8') : dto.content;
    const title =
      dto.title || (file ? file.originalname.replace(/\.md$/i, '') : undefined);
    return this.knowledge.create(content ?? '', title, req.user?._id);
  }

  @Get()
  list() {
    return this.knowledge.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.knowledge.getById(id);
  }

  /** Update a guide's title and/or content (regenerates metadata on content change). */
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateKnowledgeDto) {
    return this.knowledge.update(id, { title: dto.title, content: dto.content });
  }

  @Post(':id/reprocess')
  reprocess(@Param('id') id: string) {
    return this.knowledge.reprocess(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledge.remove(id);
  }
}
