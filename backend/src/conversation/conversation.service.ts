import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { AGENT_RUNTIME, AgentRuntime } from '../agent/agent-runtime.port';
import { AgentChunk } from '../agent/agent.types';
import { SessionService } from '../session/session.service';
import { ConversationSession, Language } from '../session/session.types';
import { ConversationRepository } from './conversation.repository';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly sessions: SessionService,
    @Inject(AGENT_RUNTIME) private readonly agent: AgentRuntime,
    private readonly conversationRepo: ConversationRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * Ownership guard: load the conversation and ensure it belongs to `userId`.
   * Throws 404 (NotFound) when missing OR owned by someone else — never disclose
   * the existence of another user's conversation (FR-009, SC-003).
   * Note: a session id IS the conversation id.
   */
  private async assertOwned(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    // A non-ObjectId id (e.g. a stale client UUID) can never belong to anyone →
    // treat as not found instead of letting Mongoose throw a 500 CastError.
    if (!isValidObjectId(conversationId)) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
    const conv =
      await this.conversationRepo.findConversationById(conversationId);
    if (!conv || String(conv.userId) !== String(userId)) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
  }

  // ── Per-session custom system prompt (Redis) ─────────────────────────
  private spKey(sessionId: string): string {
    return `session:${sessionId}:sysprompt`;
  }
  async getSystemPrompt(
    sessionId: string,
    userId: string,
  ): Promise<string | null> {
    await this.assertOwned(sessionId, userId);
    return this.redis.get(this.spKey(sessionId));
  }
  async setSystemPrompt(
    sessionId: string,
    userId: string,
    prompt: string | null,
  ): Promise<void> {
    await this.assertOwned(sessionId, userId);
    if (prompt && prompt.trim()) {
      await this.redis.setEx(this.spKey(sessionId), prompt, 7 * 24 * 3600);
    } else {
      await this.redis.del(this.spKey(sessionId));
    }
  }

  // ── Per-session model override (Redis) ───────────────────────────────
  private modelKey(sessionId: string): string {
    return `session:${sessionId}:model`;
  }
  async getModel(sessionId: string, userId: string): Promise<string | null> {
    await this.assertOwned(sessionId, userId);
    return this.redis.get(this.modelKey(sessionId));
  }
  async setModel(
    sessionId: string,
    userId: string,
    model: string | null,
  ): Promise<void> {
    await this.assertOwned(sessionId, userId);
    if (model && model.trim()) {
      await this.redis.setEx(
        this.modelKey(sessionId),
        model.trim(),
        7 * 24 * 3600,
      );
    } else {
      await this.redis.del(this.modelKey(sessionId));
    }
  }

  async createConversation(
    userId: string,
    language: Language | null,
  ): Promise<ConversationSession> {
    const conversation = await this.conversationRepo.createConversation(userId);
    return this.sessions.createSession(conversation._id.toString(), language);
  }

  // ── Conversation management (owner-scoped) ───────────────────────────

  /** List the user's active conversations, newest-updated first. */
  async listConversations(userId: string): Promise<
    Array<{
      id: string;
      title: string;
      createdAt: string | null;
      updatedAt: string | null;
    }>
  > {
    const convs =
      await this.conversationRepo.findActiveConversationsByUser(userId);
    return convs.map((c) => ({
      id: c._id.toString(),
      title: c.title || 'New Conversation',
      createdAt: (c as any).createdAt?.toISOString() ?? null,
      updatedAt: (c as any).updatedAt?.toISOString() ?? null,
    }));
  }

  /** Get one conversation + its full ordered message history. */
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertOwned(conversationId, userId);
    const conv =
      await this.conversationRepo.findConversationById(conversationId);
    const messages =
      await this.conversationRepo.getMessagesByConversation(conversationId);
    return {
      id: conversationId,
      title: conv!.title,
      createdAt: (conv as any).createdAt?.toISOString() ?? null,
      updatedAt: (conv as any).updatedAt?.toISOString() ?? null,
      messages: messages.map((m) => ({
        id: m._id.toString(),
        role: m.role,
        content: m.content,
        timestamp: m.timestamp?.toISOString?.() ?? null,
        toolSteps: (m.metadata as any)?.toolSteps ?? undefined,
        error: (m.metadata as any)?.error ?? undefined,
      })),
    };
  }

  /** Rename a conversation (owner-scoped). */
  async renameConversation(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<{ id: string; title: string }> {
    await this.assertOwned(conversationId, userId);
    await this.conversationRepo.updateConversationTitle(conversationId, title);
    return { id: conversationId, title };
  }

  /** Delete a conversation and all its messages (owner-scoped). */
  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    await this.assertOwned(conversationId, userId);
    await this.conversationRepo.deleteConversation(conversationId);
    return { ok: true };
  }

  /**
   * Core chat loop: join session + agent runtime, stream AgentChunk.
   * - Persist the user turn before running the agent (never lost).
   * - Assemble tokens + collect tool steps; persist the assistant turn on done.
   * - Runtime error → structured error chunk; record the failure without a
   *   corrupt assistant entry.
   */
  async *streamMessage(
    sessionId: string,
    userId: string,
    message: string,
  ): AsyncIterable<AgentChunk> {
    await this.assertOwned(sessionId, userId);
    await this.sessions.getSessionOrThrow(sessionId);

    const language = this.detectLanguage(message);
    await this.sessions.setLanguageIfUnset(sessionId, language);

    // Auto-title from the first user message while still on the default title.
    await this.maybeAutoTitle(sessionId, message);

    // Persist the user turn (awaited — must not be lost on a later failure).
    await this.sessions.appendTurn(sessionId, {
      role: 'user',
      content: message,
      ts: new Date().toISOString(),
    });

    const session = await this.sessions.getSessionOrThrow(sessionId);
    const history = await this.sessions.getContextTurns(sessionId);
    const systemPrompt = (await this.getSystemPromptRaw(sessionId)) ?? undefined;
    const model = (await this.getModelRaw(sessionId)) ?? undefined;

    let assembled = '';
    let errored = false;
    let errorMessage: string | null = null;
    const toolSteps: Array<{ name: string; order: number }> = [];

    try {
      for await (const chunk of this.agent.run({
        sessionId,
        message,
        language: session.language,
        history,
        systemPrompt,
        model,
      })) {
        if (chunk.type === 'token') assembled += chunk.text;
        if (chunk.type === 'tool' && chunk.status === 'running') {
          toolSteps.push({ name: chunk.name, order: toolSteps.length + 1 });
        }
        if (chunk.type === 'error') {
          errored = true;
          errorMessage = chunk.message;
        }
        yield chunk;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
    } catch (err) {
      this.logger.error(
        `Stream error session=${sessionId}: ${(err as Error).message}`,
      );
      errored = true;
      errorMessage = (err as Error).message;
      yield {
        type: 'error',
        code: 'AGENT_STREAM_ERROR',
        message: (err as Error).message,
      };
    }

    // Persist the assistant turn (awaited). On error, record the failure in
    // metadata instead of writing a corrupt/duplicate reply (FR-018).
    if (!errored && assembled.trim().length > 0) {
      await this.sessions.appendTurn(
        sessionId,
        {
          role: 'assistant',
          content: assembled.trim(),
          ts: new Date().toISOString(),
        },
        { toolSteps },
      );
    } else if (errored) {
      await this.sessions.recordAssistantError(
        sessionId,
        errorMessage ?? 'unknown error',
        toolSteps,
      );
    }
  }

  /**
   * Guest chat loop: same agent streaming as streamMessage, but on an ephemeral
   * Redis-only session — no ownership check, no MongoDB persistence. In-session
   * memory works; nothing survives a refresh once the session TTL expires.
   */
  async *streamGuest(
    sessionId: string,
    message: string,
  ): AsyncIterable<AgentChunk> {
    await this.sessions.ensureEphemeralSession(sessionId);

    const language = this.detectLanguage(message);
    await this.sessions.setLanguageIfUnset(sessionId, language);

    await this.sessions.appendTurnEphemeral(sessionId, {
      role: 'user',
      content: message,
      ts: new Date().toISOString(),
    });

    const session = await this.sessions.getSessionOrThrow(sessionId);
    const history = await this.sessions.getContextTurns(sessionId);

    let assembled = '';
    let errored = false;
    try {
      for await (const chunk of this.agent.run({
        sessionId,
        message,
        language: session.language,
        history,
      })) {
        if (chunk.type === 'token') assembled += chunk.text;
        if (chunk.type === 'error') errored = true;
        yield chunk;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
    } catch (err) {
      this.logger.error(
        `Guest stream error session=${sessionId}: ${(err as Error).message}`,
      );
      yield {
        type: 'error',
        code: 'AGENT_STREAM_ERROR',
        message: (err as Error).message,
      };
      errored = true;
    }

    if (!errored && assembled.trim().length > 0) {
      await this.sessions.appendTurnEphemeral(sessionId, {
        role: 'assistant',
        content: assembled.trim(),
        ts: new Date().toISOString(),
      });
    }
  }

  /** Non-stream fallback: concatenate all tokens into one reply. */
  async sendMessage(
    sessionId: string,
    userId: string,
    message: string,
  ): Promise<{ sessionId: string; reply: string; finishReason: string }> {
    let reply = '';
    let finishReason = 'stop';
    for await (const chunk of this.streamMessage(sessionId, userId, message)) {
      if (chunk.type === 'token') reply += chunk.text;
      if (chunk.type === 'done') finishReason = chunk.finishReason;
      if (chunk.type === 'error') {
        return { sessionId, reply: chunk.message, finishReason: 'error' };
      }
    }
    return { sessionId, reply: reply.trim(), finishReason };
  }

  // Internal raw getters (ownership already checked by the caller).
  private getSystemPromptRaw(sessionId: string): Promise<string | null> {
    return this.redis.get(this.spKey(sessionId));
  }
  private getModelRaw(sessionId: string): Promise<string | null> {
    return this.redis.get(this.modelKey(sessionId));
  }

  /** Set the conversation title from the first user message if still default. */
  private async maybeAutoTitle(
    conversationId: string,
    message: string,
  ): Promise<void> {
    try {
      const conv =
        await this.conversationRepo.findConversationById(conversationId);
      if (conv && (!conv.title || conv.title === 'New Conversation')) {
        const title = message.trim().replace(/\s+/g, ' ').slice(0, 60);
        if (title)
          await this.conversationRepo.updateConversationTitle(
            conversationId,
            title,
          );
      }
    } catch {
      /* non-fatal: title is cosmetic */
    }
  }

  /** Rough VN/EN language detection from Vietnamese diacritics. */
  private detectLanguage(text: string): Language {
    const vietnamese =
      /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
    return vietnamese.test(text) ? 'vi' : 'en';
  }
}
