import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ConversationRepository } from '../conversation/conversation.repository';
import {
  ConversationSession,
  ConversationTurn,
  Language,
  sessionKey,
  turnsKey,
} from './session.types';

/**
 * Store/restore session state on Redis and MongoDB. Each session:
 *  - hash  `session:{id}`        → metadata (Redis)
 *  - list  `session:{id}:turns`  → turn history (JSON) (Redis)
 * Full history is persisted to MongoDB via ConversationRepository.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ConversationRepository))
    private readonly conversationRepo: ConversationRepository,
  ) {}

  private get ttl(): number {
    return this.config.get<number>('session.ttlSeconds') as number;
  }

  private get maxContextTurns(): number {
    return this.config.get<number>('session.maxContextTurns') as number;
  }

  async createSession(
    id: string,
    language: Language | null = null,
  ): Promise<ConversationSession> {
    const now = new Date().toISOString();
    const session: ConversationSession = {
      id,
      language,
      createdAt: now,
      updatedAt: now,
    };
    await this.redis.hset(sessionKey(id), {
      language: language ?? '',
      createdAt: now,
      updatedAt: now,
    });
    await this.redis.expire(sessionKey(id), this.ttl);
    return session;
  }

  async exists(id: string): Promise<boolean> {
    return this.redis.exists(sessionKey(id));
  }

  /** Load the session from Redis, falling back to MongoDB. */
  async getSessionOrThrow(id: string): Promise<ConversationSession> {
    const data = await this.redis.hgetall(sessionKey(id));
    if (data && Object.keys(data).length > 0) {
      return {
        id,
        language: (data.language || null) as Language | null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }

    // Fallback to DB
    const conversation = await this.conversationRepo.findConversationById(id);
    if (!conversation || conversation.status === 'archived') {
      throw new NotFoundException(
        `Session ${id} does not exist or has been archived`,
      );
    }

    // Load metadata to redis
    await this.createSession(id);

    // Load history to redis
    const messages = await this.conversationRepo.getMessagesByConversation(id);
    if (messages.length > 0) {
      const turns: string[] = messages.map((m) =>
        JSON.stringify({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        }),
      );
      await this.redis.rpush(turnsKey(id), ...turns);
      await this.redis.expire(turnsKey(id), this.ttl);
    }

    return {
      id,
      language: null,
      createdAt:
        (conversation as any).createdAt?.toISOString() ||
        new Date().toISOString(),
      updatedAt:
        (conversation as any).updatedAt?.toISOString() ||
        new Date().toISOString(),
    };
  }

  /** Set the language once, on the first turn (FR-007). */
  async setLanguageIfUnset(id: string, language: Language): Promise<void> {
    const data = await this.redis.hgetall(sessionKey(id));
    if (data && !data.language) {
      await this.redis.hset(sessionKey(id), { language });
    }
  }

  /**
   * Append a turn to Redis (context) and persist it to MongoDB (source of truth).
   * The DB write is awaited so messages are not silently lost; failures are logged
   * with context. `metadata` carries assistant tool steps (and bumps updatedAt).
   */
  async appendTurn(
    id: string,
    turn: ConversationTurn,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.redis.rpush(turnsKey(id), JSON.stringify(turn));
    await this.touch(id);

    try {
      await this.conversationRepo.saveMessage(
        id,
        turn.role,
        turn.content,
        metadata,
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist ${turn.role} message for conversation ${id}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /** Ensure an ephemeral (Redis-only) session exists — used by guest chat. */
  async ensureEphemeralSession(id: string): Promise<void> {
    if (!(await this.exists(id))) {
      await this.createSession(id);
    }
  }

  /**
   * Append a turn to Redis ONLY (no MongoDB) — for guest sessions that are not
   * persisted. TTL-expired with the rest of the ephemeral session.
   */
  async appendTurnEphemeral(id: string, turn: ConversationTurn): Promise<void> {
    await this.redis.rpush(turnsKey(id), JSON.stringify(turn));
    await this.touch(id);
  }

  /**
   * Record a failed assistant turn: no corrupt reply content, just the error and
   * any tool steps that ran, so the transcript stays clean (FR-018).
   */
  async recordAssistantError(
    id: string,
    error: string,
    toolSteps: Array<{ name: string; order: number }>,
  ): Promise<void> {
    try {
      await this.conversationRepo.saveMessage(id, 'assistant', '', {
        error,
        toolSteps,
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist assistant error for conversation ${id}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /** Trimmed history (last maxContextTurns) used as agent context (FR-003). */
  async getContextTurns(id: string): Promise<ConversationTurn[]> {
    // We assume getSessionOrThrow is called before this, ensuring data is in Redis
    const start = -this.maxContextTurns;
    const raw = await this.redis.lrange(turnsKey(id), start, -1);
    return raw.map((r) => JSON.parse(r) as ConversationTurn);
  }

  async getAllTurns(id: string): Promise<ConversationTurn[]> {
    // We assume getSessionOrThrow is called before this, ensuring data is in Redis
    const raw = await this.redis.lrange(turnsKey(id), 0, -1);
    return raw.map((r) => JSON.parse(r) as ConversationTurn);
  }

  /** Refresh TTL of both metadata and history (FR-014). */
  async touch(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.redis.hset(sessionKey(id), { updatedAt: now });
    await this.redis.expire(sessionKey(id), this.ttl);
    await this.redis.expire(turnsKey(id), this.ttl);
  }
}
