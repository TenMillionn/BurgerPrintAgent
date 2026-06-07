import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Sse,
  Req,
} from '@nestjs/common';
import { RenameConversationDto } from './dto/rename-conversation.dto';
import { Observable } from 'rxjs';
import { AgentChunk } from '../agent/agent.types';
import {
  defaultSystemPrompt,
  AGENT_TOOLS_INFO,
  AVAILABLE_MODELS,
} from '../agent/pi-agent-core.runtime';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationService } from './conversation.service';
import { ApiAuth } from '../common/decorators/http.decorators';

/** NestJS SSE MessageEvent shape. `type` → SSE event name. */
interface SseMessageEvent {
  data: Record<string, unknown>;
  type: string;
}

@Controller('conversations')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(private readonly conversation: ConversationService) {}

  /** Create a new conversation/session. */
  @ApiAuth({ summary: 'Create new conversation' })
  @Post()
  async create(
    @Body() dto: CreateConversationDto,
    @Req() req: any,
  ): Promise<{ sessionId: string }> {
    const session = await this.conversation.createConversation(
      req.user._id,
      dto.language ?? null,
    );
    return { sessionId: session.id };
  }

  /** List the current user's conversations (newest-updated first). */
  @ApiAuth({ summary: 'List conversations' })
  @Get()
  async list(@Req() req: any) {
    return {
      conversations: await this.conversation.listConversations(req.user._id),
    };
  }

  /** Get one conversation with its full message history. */
  @ApiAuth({ summary: 'Get conversation with messages' })
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.conversation.getConversation(id, req.user._id);
  }

  /** Rename a conversation. */
  @ApiAuth({ summary: 'Rename conversation' })
  @Put(':id')
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameConversationDto,
    @Req() req: any,
  ) {
    return this.conversation.renameConversation(id, req.user._id, dto.title);
  }

  /** Delete a conversation and all its messages. */
  @ApiAuth({ summary: 'Delete conversation' })
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.conversation.deleteConversation(id, req.user._id);
  }

  /** Get the conversation's current system prompt + default + tools. */
  @ApiAuth({ summary: 'Get conversation system prompt' })
  @Get(':sessionId/system-prompt')
  async getSystemPrompt(
    @Param('sessionId') sessionId: string,
    @Req() req: any,
  ): Promise<{
    systemPrompt: string | null;
    default: string;
    tools: Array<{ name: string; desc: string }>;
  }> {
    const custom = await this.conversation.getSystemPrompt(
      sessionId,
      req.user._id,
    );
    return {
      systemPrompt: custom,
      default: defaultSystemPrompt(),
      tools: AGENT_TOOLS_INFO,
    };
  }

  /** Set/replace the conversation system prompt (empty = reset to default). */
  @ApiAuth({ summary: 'Set conversation system prompt' })
  @Put(':sessionId/system-prompt')
  async setSystemPrompt(
    @Param('sessionId') sessionId: string,
    @Body() body: { systemPrompt?: string },
    @Req() req: any,
  ): Promise<{ ok: boolean; usingDefault: boolean }> {
    await this.conversation.setSystemPrompt(
      sessionId,
      req.user._id,
      body?.systemPrompt ?? null,
    );
    const usingDefault = !(body?.systemPrompt && body.systemPrompt.trim());
    return { ok: true, usingDefault };
  }

  /** Get the conversation's current model + default + available models. */
  @ApiAuth({ summary: 'Get conversation model' })
  @Get(':sessionId/model')
  async getModel(
    @Param('sessionId') sessionId: string,
    @Req() req: any,
  ): Promise<{
    model: string | null;
    default: string;
    available: Array<{ id: string; label: string }>;
  }> {
    const custom = await this.conversation.getModel(sessionId, req.user._id);
    return {
      model: custom,
      default: process.env.LLM_MODEL ?? '',
      available: AVAILABLE_MODELS,
    };
  }

  /** Set/replace the conversation model (empty = back to env default). */
  @ApiAuth({ summary: 'Set conversation model' })
  @Put(':sessionId/model')
  async setModel(
    @Param('sessionId') sessionId: string,
    @Body() body: { model?: string },
    @Req() req: any,
  ): Promise<{ ok: boolean; model: string | null }> {
    await this.conversation.setModel(
      sessionId,
      req.user._id,
      body?.model ?? null,
    );
    return {
      ok: true,
      model:
        (body?.model && body.model.trim()) || (process.env.LLM_MODEL ?? null),
    };
  }

  /**
   * Streaming conversation over SSE (FR-002). Message is passed via query.
   * Maps AgentChunk → MessageEvent; closes cleanly on done/error/disconnect.
   */
  @ApiAuth({ summary: 'Stream conversation messages via SSE' })
  @Sse(':sessionId/stream')
  stream(
    @Param('sessionId') sessionId: string,
    @Query('message') message: string,
    @Req() req: any,
  ): Observable<SseMessageEvent> {
    if (!message || message.trim().length === 0) {
      throw new BadRequestException('Query param "message" is required');
    }
    const userId = req.user._id;

    return new Observable<SseMessageEvent>((subscriber) => {
      let cancelled = false;
      this.logger.log(`SSE open session=${sessionId}`);

      (async () => {
        try {
          for await (const chunk of this.conversation.streamMessage(
            sessionId,
            userId,
            message,
          )) {
            if (cancelled) break;
            subscriber.next({ type: chunk.type, data: this.toData(chunk) });
          }
          if (!cancelled) {
            this.logger.log(`SSE done session=${sessionId}`);
            subscriber.complete();
          }
        } catch (err) {
          // 404 (missing session) or pre-stream error → emit an SSE error then complete.
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

      // Teardown when the client disconnects (FR-013).
      return () => {
        cancelled = true;
        this.logger.log(`SSE closed session=${sessionId}`);
      };
    });
  }

  /** Non-stream fallback — handy for curl/tests. */
  @ApiAuth({ summary: 'Send message to conversation without SSE' })
  @Post(':sessionId/messages')
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateMessageDto,
    @Req() req: any,
  ): Promise<{ sessionId: string; reply: string; finishReason: string }> {
    return this.conversation.sendMessage(sessionId, req.user._id, dto.message);
  }

  private toData(chunk: AgentChunk): Record<string, unknown> {
    switch (chunk.type) {
      case 'token':
        return { text: chunk.text };
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
        return { sides: chunk.sides, ref: chunk.ref };
      case 'error':
        return { code: chunk.code, message: chunk.message };
      case 'done':
        return { finishReason: chunk.finishReason };
    }
  }
}
