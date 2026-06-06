import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KnowledgeDocDocument = KnowledgeDoc & Document;

/**
 * An admin-authored "playbook" guide plus LLM-generated retrieval metadata.
 * The metadata fields (not the raw content) are what the BM25 index searches.
 */
@Schema({ timestamps: true, collection: 'knowledgedocs' })
export class KnowledgeDoc {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  content: string; // original Markdown

  @Prop({ default: '' })
  summary: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ type: [String], default: [] })
  intents: string[];

  @Prop({ type: [String], default: [] })
  sampleQuestions: string[];

  // 'ready' when metadata was generated; 'pending' when generation failed (reprocessable).
  @Prop({ enum: ['ready', 'pending'], default: 'ready' })
  metadataStatus: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const KnowledgeDocSchema = SchemaFactory.createForClass(KnowledgeDoc);
