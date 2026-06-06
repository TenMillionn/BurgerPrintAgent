import {
  BadRequestException,
  Controller,
  Logger,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Public } from '../auth/decorators/public.decorator';
import { ConversationService } from './conversation.service';
import { AgentChunk } from '../agent/agent.types';

interface SseMessageEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Public, login-free chat for guests. Streams the agent on an ephemeral
 * Redis-only session — nothing is persisted, so a refresh starts fresh.
 * The client supplies its own random sessionId per guest conversation.
 */
@ApiTags('guest')
@Public()
@Controller('guest')
export class GuestController {
  private readonly logger = new Logger(GuestController.name);

  constructor(private readonly conversation: ConversationService) {}

  @Sse(':sessionId/stream')
  stream(
    @Param('sessionId') sessionId: string,
    @Query('message') message: string,
  ): Observable<SseMessageEvent> {
    if (!message || message.trim().length === 0) {
      throw new BadRequestException('Query param "message" is required');
    }

    return new Observable<SseMessageEvent>((subscriber) => {
      let cancelled = false;
      (async () => {
        try {
          for await (const chunk of this.conversation.streamGuest(
            sessionId,
            message,
          )) {
            if (cancelled) break;
            subscriber.next({ type: chunk.type, data: this.toData(chunk) });
          }
          if (!cancelled) subscriber.complete();
        } catch (err) {
          if (!cancelled) {
            subscriber.next({
              type: 'error',
              data: {
                code: 'STREAM_INIT_ERROR',
                message: (err as Error).message,
              },
            });
            subscriber.complete();
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    });
  }

  private toData(chunk: AgentChunk): Record<string, unknown> {
    switch (chunk.type) {
      case 'token':
      case 'thinking':
        return { text: chunk.text };
      case 'tool':
        return {
          id: chunk.id,
          name: chunk.name,
          status: chunk.status,
          count: chunk.count,
          results: chunk.results,
        };
      case 'action':
        return { action: chunk.action, message: chunk.message };
      case 'buttons':
        return { buttons: chunk.buttons };
      case 'upload_card':
        return { side: chunk.side, ref: chunk.ref };
      case 'error':
        return { code: chunk.code, message: chunk.message };
      case 'done':
        return { finishReason: chunk.finishReason };
      default:
        return {};
    }
  }
}
