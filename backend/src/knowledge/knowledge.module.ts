import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeAiService } from './knowledge-ai.service';
import { KnowledgeDoc, KnowledgeDocSchema } from './schemas/knowledge.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeDoc.name, schema: KnowledgeDocSchema },
    ]),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeAiService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
