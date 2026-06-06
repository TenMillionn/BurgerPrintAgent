import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import MiniSearch from 'minisearch';
import { KnowledgeDoc, KnowledgeDocDocument } from './schemas/knowledge.schema';
import { KnowledgeAiService } from './knowledge-ai.service';

const MAX_CONTENT = 40_000; // reject absurdly large uploads
const RETRIEVE_SCORE_FLOOR = 1.5; // BM25 score below this → treated as "not relevant"
const RETRIEVE_TOP_K = 2;
const RETURNED_CONTENT_LIMIT = 4_000; // bound guide content loaded into the agent context

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectModel(KnowledgeDoc.name)
    private readonly model: Model<KnowledgeDocDocument>,
    private readonly ai: KnowledgeAiService,
  ) {}

  /** Create a guide from raw Markdown; generate metadata, or mark 'pending' on failure. */
  async create(content: string, title: string | undefined, userId?: string) {
    const body = (content ?? '').trim();
    if (!body) throw new BadRequestException('Guide content is empty');
    if (body.length > MAX_CONTENT) {
      throw new BadRequestException('Guide content is too large');
    }
    const finalTitle = (title?.trim() || this.deriveTitle(body)).slice(0, 200);

    let metadata = {
      summary: '',
      keywords: [] as string[],
      intents: [] as string[],
      sampleQuestions: [] as string[],
    };
    let metadataStatus = 'ready';
    try {
      metadata = await this.ai.generate(body);
    } catch (err) {
      // Never lose the guide on a transient LLM failure — save and allow reprocess.
      this.logger.warn(`Metadata generation failed, saving as pending: ${err}`);
      metadataStatus = 'pending';
    }

    const doc = await this.model.create({
      title: finalTitle,
      content: body,
      ...metadata,
      metadataStatus,
      createdBy: userId,
    });
    return this.toCard(doc);
  }

  /** Admin list: newest first, lightweight cards. */
  async list() {
    const docs = await this.model
      .find()
      .sort({ updatedAt: -1 })
      .select('title summary metadataStatus createdAt')
      .lean();
    return {
      guides: docs.map((d: any) => ({
        id: d._id.toString(),
        title: d.title,
        summary: d.summary,
        metadataStatus: d.metadataStatus,
        createdAt: d.createdAt,
      })),
    };
  }

  async getById(id: string) {
    const doc = await this.loadOrThrow(id);
    return this.toFull(doc);
  }

  async remove(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Guide not found');
    const res = await this.model.deleteOne({ _id: id });
    if (res.deletedCount === 0) throw new NotFoundException('Guide not found');
    return { ok: true };
  }

  /** Update a guide's title and/or content; regenerate metadata when content changes. */
  async update(id: string, patch: { title?: string; content?: string }) {
    const doc = await this.loadOrThrow(id);
    if (patch.title != null) doc.title = patch.title.trim().slice(0, 200);
    if (patch.content != null) {
      const body = patch.content.trim();
      if (!body) throw new BadRequestException('Guide content is empty');
      if (body.length > MAX_CONTENT) {
        throw new BadRequestException('Guide content is too large');
      }
      doc.content = body;
      try {
        const metadata = await this.ai.generate(body);
        doc.summary = metadata.summary;
        doc.keywords = metadata.keywords;
        doc.intents = metadata.intents;
        doc.sampleQuestions = metadata.sampleQuestions;
        doc.metadataStatus = 'ready';
      } catch (err) {
        this.logger.warn(`Metadata regeneration failed on update: ${err}`);
        doc.metadataStatus = 'pending';
      }
    }
    await doc.save();
    return this.toFull(doc);
  }

  /** Regenerate metadata from the stored content. */
  async reprocess(id: string) {
    const doc = await this.loadOrThrow(id);
    const metadata = await this.ai.generate(doc.content);
    doc.summary = metadata.summary;
    doc.keywords = metadata.keywords;
    doc.intents = metadata.intents;
    doc.sampleQuestions = metadata.sampleQuestions;
    doc.metadataStatus = 'ready';
    await doc.save();
    return this.toFull(doc);
  }

  /**
   * Retrieve the most relevant guide(s) for a query. Builds a MiniSearch (BM25)
   * index over the metadata (NOT the raw content), mirroring MemoryService.
   * Returns [] when nothing clears the score floor so the agent answers normally.
   */
  async retrieve(query: string): Promise<{
    matches: Array<{
      id: string;
      title: string;
      summary: string;
      content: string;
    }>;
    note: string;
  }> {
    const note =
      'If matches is non-empty, follow that guide to shape your answer. If matches is empty, answer normally.';
    const q = (query ?? '').trim();
    if (!q) return { matches: [], note };

    const docs = await this.model.find().lean();
    if (docs.length === 0) return { matches: [], note };

    const mini = new MiniSearch<{
      id: string;
      title: string;
      summary: string;
      keywords: string;
      intents: string;
      sampleQuestions: string;
    }>({
      fields: ['title', 'summary', 'keywords', 'intents', 'sampleQuestions'],
      storeFields: ['title'],
      tokenize: (s) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [],
      searchOptions: { fuzzy: 0.2, prefix: true },
    });
    mini.addAll(
      docs.map((d: any) => ({
        id: d._id.toString(),
        title: d.title,
        summary: d.summary,
        keywords: (d.keywords ?? []).join(' '),
        intents: (d.intents ?? []).join(' '),
        sampleQuestions: (d.sampleQuestions ?? []).join(' '),
      })),
    );

    const hits = mini
      .search(q)
      .filter((h: any) => h.score >= RETRIEVE_SCORE_FLOOR)
      .slice(0, RETRIEVE_TOP_K);

    const byId = new Map(docs.map((d: any) => [d._id.toString(), d]));
    const matches = hits.map((h: any) => {
      const d: any = byId.get(h.id);
      return {
        id: h.id,
        title: d.title,
        summary: d.summary,
        content: String(d.content).slice(0, RETURNED_CONTENT_LIMIT),
      };
    });
    return { matches, note };
  }

  // ── helpers ──────────────────────────────────────────────────────────
  private async loadOrThrow(id: string): Promise<KnowledgeDocDocument> {
    if (!isValidObjectId(id)) throw new NotFoundException('Guide not found');
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Guide not found');
    return doc;
  }

  private deriveTitle(content: string): string {
    const firstHeading = content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('#'));
    if (firstHeading) return firstHeading.replace(/^#+\s*/, '');
    return content.split('\n')[0]?.slice(0, 80) || 'Untitled guide';
  }

  private toCard(doc: KnowledgeDocDocument) {
    return {
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      keywords: doc.keywords,
      intents: doc.intents,
      sampleQuestions: doc.sampleQuestions,
      metadataStatus: doc.metadataStatus,
      createdAt: (doc as any).createdAt,
    };
  }

  private toFull(doc: KnowledgeDocDocument) {
    return { ...this.toCard(doc), content: doc.content };
  }
}
