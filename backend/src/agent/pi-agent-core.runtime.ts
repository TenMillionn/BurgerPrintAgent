import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BurgerPrintsService } from '../burgerprints/burgerprints.service';
import { MemoryService } from '../memory/memory.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { WebFetchService } from './web-fetch.service';
import { AgentLogger } from '../logging/agent-logger.service';
import { AgentRuntime } from './agent-runtime.port';
import { AgentChunk, AgentRunInput } from './agent.types';
import { BurgerPrintToolService } from 'src/burgerprints/burgerprints-tool.service';
import { UserKeyService } from '../users/user-key.service';
import { DesignAssetService } from '../design/design-asset.service';

/**
 * Adapter around `@earendil-works/pi-agent-core` (the "Pi" toolkit by earendil-works,
 * built on `@earendil-works/pi-ai`). pi-agent-core is **push-based**: we `subscribe`
 * to AgentEvents and call `await agent.prompt(...)`. This adapter bridges push → pull to
 * match the `AgentRuntime.run(): AsyncIterable<AgentChunk>` port that the rest of the system
 * (controller/SSE/session) uses — so the controller does not need to change.
 *
 * Event mapping:
 *   message_update + assistantMessageEvent.text_delta  → AgentChunk token
 *   tool_execution_start / tool_execution_end          → AgentChunk tool (running/done)
 *   agent_end (state.errorMessage)                     → AgentChunk error
 *   agent_end                                          → AgentChunk done
 *
 * Reference: https://www.npmjs.com/package/@earendil-works/pi-agent-core (README "Event Flow").
 */

// Indirect dynamic import: pi packages are ESM-only. Use Function to keep a real `import()`
// at runtime so tsc (module=commonjs) does not downgrade it to require() and break ESM.
const esmImport = new Function('m', 'return import(m)') as (
  m: string,
) => Promise<any>;

// Internal gate tools — they still run (and may emit action/buttons), but their
// tool step is NOT shown in the FE pipeline/timeline (it's noise to the seller).
const HIDDEN_TIMELINE_TOOLS = new Set(['check_auth', 'require_seller_key']);

@Injectable()
export class PiAgentCoreRuntime implements AgentRuntime {
  private readonly logger = new Logger(PiAgentCoreRuntime.name);

  constructor(
    private readonly config: ConfigService,
    private readonly burgerprints: BurgerPrintsService,
    private readonly memory: MemoryService,
    private readonly agentLog: AgentLogger,

    private readonly burgerPrintToolService: BurgerPrintToolService,
    private readonly knowledge: KnowledgeService,
    private readonly webFetch: WebFetchService,
    private readonly userKey: UserKeyService,
    private readonly designAssets: DesignAssetService,
  ) {}

  /**
   * In-memory idempotency guard: a real order already created for a given
   * reference_order_id (agent-<sessionId>-<turn>) is not created again — a repeat
   * call in the same turn returns the cached result instead of a duplicate order.
   */
  private readonly createdOrders = new Map<string, unknown>();

  /**
   * Resolve the seller's own BurgerPrints key for money/account tools.
   * No authenticated user → requires login; user without a key → requires key.
   */
  private async resolveSellerKey(
    input: AgentRunInput,
  ): Promise<
    { apiKey: string } | { requires: 'login' | 'apikey'; message: string }
  > {
    if (!input.userId) {
      return { requires: 'login', message: 'Please log in to manage orders' };
    }
    const key = await this.userKey.getDecryptedKey(input.userId);
    if (!key) {
      return {
        requires: 'apikey',
        message: 'Please configure your BurgerPrints API key in settings',
      };
    }
    return { apiKey: key };
  }

  /**
   * Resolve the design image URL for an order side: an explicit asset id (from the
   * chooser) wins, otherwise the latest VALID upload for the side. Returns undefined
   * when none — create_order then blocks the real order (MISSING_DESIGN).
   */
  private async resolveDesignUrl(
    input: AgentRunInput,
    side: 'front' | 'back',
    assetId?: string,
  ): Promise<string | undefined> {
    if (!input.userId) return undefined;
    if (assetId) {
      const a = await this.designAssets.findById(assetId, input.userId);
      return a?.url;
    }
    const a = await this.designAssets.latestValid(
      input.sessionId,
      input.userId,
      side,
    );
    return a?.url;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentChunk> {
    const startedAt = Date.now();
    let finalText = '';
    void this.agentLog.turnStart(input.sessionId, {
      message: input.message,
      history_turns: input.history.length,
      custom_prompt: !!(input.systemPrompt && input.systemPrompt.trim()),
    });
    let Agent: any;
    let getModel: any;
    try {
      ({ Agent } = await esmImport('@earendil-works/pi-agent-core'));
      ({ getModel } = await esmImport('@earendil-works/pi-ai'));
    } catch (err) {
      this.logger.error(
        `Failed to load pi-agent-core: ${(err as Error).message}`,
      );
      yield {
        type: 'error',
        code: 'AGENT_RUNTIME_UNAVAILABLE',
        message:
          'pi-agent-core is not installed. Run `npm i @earendil-works/pi-agent-core @earendil-works/pi-ai`.',
      };
      return;
    }

    const provider = this.config.get<string>('llm.provider') as string;
    // Per-session model override (if the seller chose one) → fallback to LLM_MODEL from env.
    const modelId =
      (input.model && input.model.trim()) ||
      (this.config.get<string>('llm.model') as string);

    // Resolve the model once (re-used across retry attempts).
    let model: any;
    try {
      // pi-ai reads the API key from env (ANTHROPIC_API_KEY / OPENAI_API_KEY).
      const openaiBaseUrl = this.config.get<string>('llm.openaiBaseUrl');

      if (provider === 'openai' && openaiBaseUrl) {
        // OpenAI-compatible proxy (vilao/OpenRouter/Azure/local): the model id may
        // NOT be in the pi-ai registry (e.g. "gx/gpt-5.4"). Build from a valid template
        // then override id + baseUrl, and force /chat/completions (proxies usually support
        // completions, not the Responses API → avoids the "messages null" error).
        model = getModel('openai', 'gpt-4o');
        if (modelId) model.id = modelId;
        model.baseUrl = openaiBaseUrl;
        model.api = 'openai-completions';
      } else {
        try {
          model = getModel(provider, modelId);
        } catch {
          // modelId not in the pi-ai registry (e.g. a new model: "gpt-5.4") →
          // build from the gpt-4o template then override id; the OpenAI endpoint accepts it.
          this.logger.warn(
            `Model "${modelId}" not in pi-ai registry — building from gpt-4o template.`,
          );
          model = getModel('openai', 'gpt-4o');
          model.id = modelId;
        }
      }
    } catch (err) {
      this.logger.error(`pi Agent init failed: ${(err as Error).message}`);
      yield {
        type: 'error',
        code: 'AGENT_INIT_ERROR',
        message: (err as Error).message,
      };
      return;
    }

    let agent: any;
    try {
      agent = new Agent({
        initialState: {
          systemPrompt: this.buildSystemPrompt(input),
          model,
          tools: this.buildTools(input),
          // History before the current turn (the current user turn is sent via prompt()).
          messages: this.toAgentMessages(input),
        },
      });
    } catch (err) {
      this.logger.error(`pi Agent init failed: ${(err as Error).message}`);
      yield {
        type: 'error',
        code: 'AGENT_INIT_ERROR',
        message: (err as Error).message,
      };
      return;
    }

    // ── Bridge push (subscribe) → pull (async queue) ──────────────────────
    const queue: AgentChunk[] = [];
    let wake: (() => void) | null = null;
    // Per-attempt turn state, reset before each prompt()/continue(). The terminal
    // error is captured (not queued) so the retry loop can decide whether to emit
    // it or retry instead.
    let turnDone = false;
    let turnError: { code: string; message: string } | null = null;
    let runToken = 0; // ignore a late rejection from a previous attempt
    const push = (c: AgentChunk) => {
      queue.push(c);
      if (wake) {
        wake();
        wake = null;
      }
    };
    const endTurn = (err: { code: string; message: string } | null) => {
      turnError = err;
      turnDone = true;
      if (wake) {
        wake();
        wake = null;
      }
    };

    agent.subscribe((event: any) => {
      switch (event.type) {
        case 'message_update': {
          const e = event.assistantMessageEvent;
          if (e?.type === 'text_delta' && e.delta) {
            finalText += e.delta;
            push({ type: 'token', text: e.delta });
          } else if (e?.type === 'thinking_delta' && e.delta) {
            push({ type: 'thinking', text: e.delta });
          }
          break;
        }
        case 'tool_execution_start':
          if (!HIDDEN_TIMELINE_TOOLS.has(event.toolName)) {
            push({
              type: 'tool',
              id: event.toolCallId,
              name: event.toolName,
              status: 'running',
            });
          }
          break;
        case 'tool_execution_end': {
          const details = event.result?.details ?? event.result;
          if (!HIDDEN_TIMELINE_TOOLS.has(event.toolName)) {
            const { count, results } = this.extractToolResults(
              event.toolName,
              details,
            );
            push({
              type: 'tool',
              id: event.toolCallId,
              name: event.toolName,
              status: 'done',
              count,
              results,
            });
          }
          // Gate signal → drive a FE popup (login / API-key settings).
          const requires = (details as any)?.requires;
          if (requires === 'login' || requires === 'apikey') {
            push({
              type: 'action',
              action:
                requires === 'login' ? 'login_required' : 'apikey_required',
              message: (details as any)?.message,
            });
          }
          // render_buttons → inline clickable buttons attached to this turn.
          if (
            (details as any)?.render === 'buttons' &&
            Array.isArray((details as any).buttons)
          ) {
            push({ type: 'buttons', buttons: (details as any).buttons });
          }
          // request_design_upload → one in-chat upload card (slot per side).
          if ((details as any)?.render === 'upload_card') {
            push({
              type: 'upload_card',
              sides: (details as any).sides,
              ref: (details as any).ref,
            });
          }
          break;
        }
        case 'agent_end': {
          const errorMessage = agent.state?.errorMessage;
          void this.agentLog.turnEnd(input.sessionId, {
            reply: finalText,
            finishReason: errorMessage ? 'error' : 'stop',
            error: errorMessage ?? null,
            duration_ms: Date.now() - startedAt,
          });
          endTurn(
            errorMessage
              ? { code: 'AGENT_RUNTIME_ERROR', message: errorMessage }
              : null,
          );
          break;
        }
      }
    });

    // pi-agent-core has no client-side LLM retry; the supported way to retry after
    // an error is agent.continue() (resumes from the existing context — last message
    // must be user/toolResult; see README "continue() Event Sequence"). We retry a
    // transient provider error (429/5xx, upstream connect/timeout/reset) ONLY when no
    // content was streamed yet, so output is never duplicated.
    const RETRYABLE =
      /\b(429|500|502|503|504)\b|upstream connect|connection timeout|reset before headers|disconnect\/reset|overloaded|temporarily unavailable|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i;
    const MAX_ATTEMPTS = 3;

    // Kick off a run (prompt() first, continue() to retry). Not awaited so we stream
    // events as they arrive; a rejection that bypasses agent_end is funnelled into
    // endTurn, guarded by runToken so a previous attempt's late reject is ignored.
    const startRun = (fn: () => Promise<unknown>) => {
      const myToken = runToken;
      fn().catch((err: Error) => {
        if (myToken !== runToken || turnDone) return;
        void this.agentLog.turnEnd(input.sessionId, {
          reply: finalText,
          finishReason: 'error',
          error: err.message,
          duration_ms: Date.now() - startedAt,
        });
        endTurn({ code: 'AGENT_PROMPT_ERROR', message: err.message });
      });
    };

    // Only actual reply TEXT blocks a retry (re-running would duplicate it). Tool/
    // thinking/action chunks do NOT block: after tools have run, a failed final LLM
    // call is retried with agent.continue(), which resumes from the tool results
    // without re-executing tools or re-emitting their chunks.
    let emittedText = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      turnDone = false;
      turnError = null;
      runToken++;
      if (attempt > 1) {
        // continue() requires the last message to be user/toolResult. A failed turn
        // can leave a dangling (empty) assistant message — drop trailing assistant
        // messages so the retry resumes cleanly. We only retry when no text was
        // emitted, so nothing useful is discarded.
        try {
          const msgs = (agent.state?.messages ?? []) as Array<{ role: string }>;
          let n = msgs.length;
          while (n > 0 && msgs[n - 1]?.role === 'assistant') n--;
          if (n !== msgs.length) agent.state.messages = msgs.slice(0, n);
        } catch {
          /* best-effort */
        }
      }
      startRun(
        attempt === 1
          ? () => agent.prompt(input.message)
          : () => agent.continue(),
      );

      // Consume this attempt's events until the turn ends and the queue drains.
      let turnEnded = false;
      while (!turnEnded) {
        if (queue.length > 0) {
          const chunk = queue.shift() as AgentChunk;
          if (chunk.type === 'token') {
            emittedText = true;
          }
          yield chunk;
          continue;
        }
        if (turnDone) {
          turnEnded = true;
          break;
        }
        await new Promise<void>((resolve) => (wake = resolve));
      }

      // Cast needed: turnError is only assigned inside the subscribe/catch closures,
      // so TS flow-narrows it to null at this read site.
      const te = turnError as { code: string; message: string } | null;
      if (!te) {
        yield { type: 'done', finishReason: 'stop' };
        return;
      }
      const canRetry =
        attempt < MAX_ATTEMPTS && !emittedText && RETRYABLE.test(te.message);
      if (!canRetry) {
        yield { type: 'error', code: te.code, message: te.message };
        return;
      }
      this.logger.warn(
        `Retryable LLM error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying via continue(): ${te.message}`,
      );
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 600 * attempt + 300),
      );
    }
  }

  /** System prompt: the custom one (if the seller edited it) or the default. */
  private buildSystemPrompt(input: AgentRunInput): string {
    if (input.systemPrompt && input.systemPrompt.trim())
      return input.systemPrompt;
    return defaultSystemPrompt();
  }

  /**
   * Map the session history (excluding the current user turn) to pi's AgentMessage[].
   * Note: pi `AssistantMessage.content` must be an ARRAY of content blocks (not a string),
   * while `UserMessage.content` accepts a string.
   */
  private toAgentMessages(input: AgentRunInput): unknown[] {
    const prior = input.history.slice(0, -1); // drop the current user turn (sent via prompt())
    return prior.map((t) => {
      const timestamp = Date.parse(t.ts) || undefined;
      if (t.role === 'assistant') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: t.content }],
          timestamp,
        };
      }
      return { role: 'user', content: t.content, timestamp };
    });
  }

  /** Extract a few top results from a tool output for the timeline (e.g. "8 results"). */
  private extractToolResults(
    toolName: string,
    details: any,
  ): { count?: number; results?: Array<{ title: string; meta?: string }> } {
    if (!details || typeof details !== 'object') return {};
    const money = (n: any) => (n != null && n !== '' ? `$${n}` : undefined);
    let items: Array<{ title: string; meta?: string }> | undefined;
    let count: number | undefined;

    if (toolName === 'search_products' && Array.isArray(details.products)) {
      count = details.qualified ?? details.products.length;
      items = details.products.map((p: any) => ({
        title: p.name ?? p.short_code,
        meta:
          [money(p.base_cost), p.cheapest_factory]
            .filter(Boolean)
            .join(' · ') || undefined,
      }));
    } else if (
      toolName === 'compare_factories' &&
      Array.isArray(details.factories)
    ) {
      count = details.factories.length;
      items = details.factories.map((f: any) => ({
        title: f.partner_name,
        meta: money(f.min_price),
      }));
    } else if (
      toolName === 'get_product_variants' &&
      Array.isArray(details.variants)
    ) {
      count = details.total_matched ?? details.variants.length;
      items = details.variants.map((v: any) => ({
        title: v.catalog_sku ?? v.sku,
        meta:
          [`${v.color}/${v.size}`, money(v.price)]
            .filter(Boolean)
            .join(' · ') || undefined,
      }));
    } else if (toolName === 'create_order') {
      const oid = details.result?.order_id;
      if (oid) {
        const a = details.amounts;
        const meta = a
          ? `total ${money(a.total)} (ship ${money(a.shipping_fee)})`
          : details.sandbox
            ? 'sandbox'
            : 'unpaid';
        items = [{ title: `Order ${oid}`, meta }];
      }
    } else if (toolName === 'charge_order') {
      const state = details.result?.state;
      if (state) items = [{ title: 'Charge', meta: String(state) }];
    } else if (toolName === 'get_balance') {
      const bal = details.result?.balance ?? details.result?.amount;
      if (bal != null) items = [{ title: 'Balance', meta: money(bal) }];
    } else if (toolName === 'list_orders' && Array.isArray(details.orders)) {
      count = details.total ?? details.orders.length;
      items = details.orders.map((o: any) => ({
        title: o.order_id,
        meta:
          [money(o.amount), o.recipient].filter(Boolean).join(' · ') ||
          undefined,
      }));
    } else if (toolName === 'get_order') {
      const st = details.result?.state ?? details.result?.data?.state;
      if (st) items = [{ title: 'Order', meta: String(st) }];
    } else if (toolName === 'get_order_tracking') {
      items = [
        {
          title: 'Tracking',
          meta: details.tracking ? 'available' : 'pending',
        },
      ];
    } else if (
      toolName === 'render_buttons' &&
      Array.isArray(details.buttons)
    ) {
      count = details.buttons.length;
      items = details.buttons.map((b: any) => ({ title: b.label }));
    } else if (toolName === 'request_design_upload') {
      items = [
        {
          title: 'Upload card',
          meta: Array.isArray(details.sides)
            ? details.sides.join(', ')
            : undefined,
        },
      ];
    } else if (toolName === 'validate_design' && details.width) {
      items = [
        {
          title: details.valid ? 'Valid' : 'Invalid',
          meta: `${details.width}×${details.height}`,
        },
      ];
    } else if (
      toolName === 'process_design' &&
      Array.isArray(details.processed)
    ) {
      count = details.processed.length;
      items = details.processed.map((a: any) => ({
        title: a.side,
        meta: `${a.width}×${a.height}`,
      }));
    } else if (
      toolName === 'list_design_assets' &&
      Array.isArray(details.assets)
    ) {
      count = details.assets.length;
      items = details.assets.map((a: any) => ({
        title: a.side,
        meta: `${a.width}×${a.height}${a.valid ? '' : ' (invalid)'}`,
      }));
    } else if (toolName === 'cancel_order' || toolName === 'delete_order') {
      const ok = details.result?.is_success ?? !details.error;
      items = [
        {
          title: toolName === 'cancel_order' ? 'Cancel' : 'Delete',
          meta: ok ? 'ok' : 'failed',
        },
      ];
    } else if (toolName === 'get_shipping' && Array.isArray(details.shipping)) {
      count = details.total_countries ?? details.shipping.length;
      items = details.shipping.map((s: any) => ({
        title: s.country,
        meta:
          [money(s.first_item_price), s.time].filter(Boolean).join(' · ') ||
          undefined,
      }));
    } else if (
      toolName === 'retrieve_knowledge' &&
      Array.isArray(details.matches)
    ) {
      count = details.matches.length;
      items = details.matches.map((m: any) => ({ title: m.title }));
    } else if (toolName === 'fetch_url' && (details.title || details.note)) {
      items = [{ title: details.title || details.url, meta: details.note }];
    }

    return { count, results: items?.slice(0, 8) };
  }

  /** BurgerPrints API v2.0 lookup tools (each returns compact data). */
  private buildTools(input: AgentRunInput): unknown[] {
    const tool = (
      name: string,
      description: string,
      properties: Record<string, unknown>,
      required: string[],
      run: (params: any) => Promise<unknown>,
    ) => ({
      name,
      description,
      parameters: { type: 'object', properties, required },
      execute: async (_id: string, params: any) => {
        const data = await run(params ?? {});
        void this.agentLog.tool(input.sessionId, name, params ?? {}, data);
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          details: data,
        };
      },
    });

    return [
      tool(
        'search_products',
        'Find products by type/FEATURE + market + max base cost. category is full-text over ' +
          'name + description (material e.g. "cotton"/"ring-spun", print technique "DTG"/"DTF", features ' +
          '"long sleeve"/"fleece"...). Returns base_cost (lowest), cheapest factory, color count, sorted by price.',
        {
          category: {
            type: 'string',
            description:
              'Product type, e.g. "t-shirt", "hoodie", "tank top", "sweatshirt"',
          },
          market: {
            type: 'string',
            description: 'Market: US | EU | CN | AU (optional)',
          },
          max_base_cost: {
            type: 'number',
            description: 'Max base cost (USD) to filter, e.g. 8 (optional)',
          },
        },
        [],
        (p) =>
          this.burgerPrintToolService.searchProducts({
            category: p.category,
            market: p.market,
            max_base_cost: p.max_base_cost,
          }),
      ),
      tool(
        'compare_factories',
        'Compare ALL factories (partner_name) of ONE product: min/max base cost per factory + sizes/colors. ' +
          'Use after a specific product is chosen (UC-02 step 2) or for margin.',
        {
          short_code: {
            type: 'string',
            description:
              'Product short_code, e.g. "USG5000" (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerPrintToolService.compareFactories(p.short_code),
      ),
      tool(
        'get_product_variants',
        'List concrete SKUs (sku, color, size, price, factory, in_stock) of a product, filtered by color/size/factory. Use for a specific color/size or before ordering.',
        {
          short_code: { type: 'string', description: 'Product short_code' },
          color: { type: 'string', description: 'Filter by color (optional)' },
          size: { type: 'string', description: 'Filter by size (optional)' },
          factory: {
            type: 'string',
            description: 'Filter by factory (optional)',
          },
        },
        ['short_code'],
        (p) =>
          this.burgerPrintToolService.getProductVariants(p.short_code, {
            color: p.color,
            size: p.size,
            factory: p.factory,
          }),
      ),
      tool(
        'create_order',
        'Create the order (single item, phase 1) — this places an UNPAID order (BurgerPrints "draft" state) on the seller\'s account and RETURNS THE PRICE (base + shipping + total) so you can quote it. ' +
          "It is not charged yet — charge_order is the separate payment step. Requires the seller's API key. Do NOT use sandbox (it returns no price). " +
          'Call this after the seller confirms the SKU + design + address (gate 1: "create the order to see the price"); then show the returned base/shipping/total and ask to pay (gate 2). If the seller declines, delete_order it.',
        {
          shipping: {
            type: 'object',
            description: 'Shipping recipient info',
            properties: {
              name: { type: 'string' },
              address1: { type: 'string' },
              address2: { type: 'string' },
              city: { type: 'string' },
              state: {
                type: 'string',
                description: '2-letter code for US (e.g. CA)',
              },
              zip: { type: 'string' },
              country: {
                type: 'string',
                description: '2-letter country code, e.g. US',
              },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['name', 'address1', 'city', 'state', 'zip', 'country'],
          },
          item: {
            type: 'object',
            description: 'The single SKU to order',
            properties: {
              catalog_sku: { type: 'string' },
              quantity: { type: 'number' },
              design_asset_id_front: {
                type: 'string',
                description:
                  'Front design asset id to use (from list_design_assets). Omit to use the latest valid front upload.',
              },
              design_asset_id_back: {
                type: 'string',
                description:
                  'Back design asset id (omit to use the latest valid back upload)',
              },
              mockup_url_front: { type: 'string' },
              mockup_url_back: { type: 'string' },
            },
            required: ['catalog_sku', 'quantity'],
          },
          shipping_label: {
            type: 'string',
            description: 'Optional shipping label URL',
          },
          sandbox: {
            type: 'boolean',
            description:
              'true = draft/test order (default true). false = real order.',
          },
        },
        ['shipping', 'item'],
        async (p) => {
          // Default to a real (unpaid) order — sandbox cannot quote a price.
          const sandbox = p.sandbox ?? false;
          // Intent key (per turn) for OUR dedup. The reference sent to the provider
          // is unique per call so a failed attempt's reference doesn't block a retry
          // (the provider rejects a reused reference with "already being processed").
          const intentKey = `agent-${input.sessionId}-${input.history.length}`;
          const referenceOrderId = `${intentKey}-${Date.now().toString(36)}`;
          let apiKey: string | undefined;
          if (!sandbox) {
            const k = await this.resolveSellerKey(input);
            if ('requires' in k) return { error: true, ...k };
            apiKey = k.apiKey;
            // Idempotency guard: a real order already SUCCEEDED for this intent →
            // return it instead of creating a duplicate (a failed attempt is not cached).
            if (this.createdOrders.has(intentKey)) {
              return this.createdOrders.get(intentKey);
            }
          }
          // Resolve design URLs from the conversation's design assets: an explicit
          // asset id (chooser) wins, else the latest VALID upload for the side.
          const it = p.item ?? {};
          const designUrl = await this.resolveDesignUrl(
            input,
            'front',
            it.design_asset_id_front,
          );
          const designUrlBack = await this.resolveDesignUrl(
            input,
            'back',
            it.design_asset_id_back,
          );
          const item = {
            catalog_sku: it.catalog_sku,
            quantity: it.quantity,
            ...(designUrl ? { design_url_front: designUrl } : {}),
            ...(designUrlBack ? { design_url_back: designUrlBack } : {}),
            ...(it.mockup_url_front
              ? { mockup_url_front: it.mockup_url_front }
              : {}),
            ...(it.mockup_url_back
              ? { mockup_url_back: it.mockup_url_back }
              : {}),
          };
          const res = await this.burgerPrintToolService.createOrder({
            shipping: p.shipping,
            item,
            shipping_label: p.shipping_label,
            sandbox,
            reference_order_id: referenceOrderId,
            apiKey,
          });
          if (!sandbox && !(res as any)?.error) {
            this.createdOrders.set(intentKey, res);
          }
          return res;
        },
      ),
      tool(
        'check_auth',
        'Check whether the seller is logged in. Call this BEFORE collecting any order info. ' +
          'If not logged in, stop and ask the seller to log in (a login prompt is shown automatically).',
        {},
        [],
        () =>
          Promise.resolve(
            input.userId
              ? { logged_in: true }
              : {
                  logged_in: false,
                  requires: 'login',
                  message: 'Please log in to place an order',
                },
          ),
      ),
      tool(
        'require_seller_key',
        'Check whether the seller has configured their own BurgerPrints API key. Call this at the draft→real-order boundary. ' +
          'If no key, stop and ask the seller to add it in settings (a settings prompt is shown automatically).',
        {},
        [],
        async () => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { has_key: false, ...k };
          return { has_key: true };
        },
      ),
      tool(
        'charge_order',
        "Charge/pay a created order from the seller's BurgerPrints wallet (gate 2). " +
          'ONLY after the seller explicitly confirms payment. Check get_balance first; never auto-charge right after create_order.',
        {
          order_id: {
            type: 'string',
            description: 'The order id returned by create_order',
          },
        },
        ['order_id'],
        async (p) => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.chargeOrder(
            [p.order_id],
            k.apiKey,
          );
        },
      ),
      tool(
        'get_balance',
        "Read the seller's BurgerPrints wallet balance. Use before charging to confirm sufficient funds.",
        {},
        [],
        async () => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.getBalance(k.apiKey);
        },
      ),
      tool(
        'list_orders',
        'List the seller\'s orders (most recent first), paginated. Use for "show my orders / order history". Each entry has order_id, reference, amount, created date, recipient.',
        {
          page: { type: 'number', description: 'Page number (default 1)' },
          page_size: {
            type: 'number',
            description: 'Items per page (default 20, max 50)',
          },
        },
        [],
        async (p) => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.listOrders(
            { page: p.page, pageSize: p.page_size },
            k.apiKey,
          );
        },
      ),
      tool(
        'get_order',
        "Get the status/details of one of the seller's orders (state, fulfillment, amounts, shipping).",
        { order_id: { type: 'string' } },
        ['order_id'],
        async (p) => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.getOrder(p.order_id, k.apiKey);
        },
      ),
      tool(
        'get_order_tracking',
        'Get tracking info for one of the seller\'s orders. Says "not available yet" gracefully when there is none.',
        { order_id: { type: 'string' } },
        ['order_id'],
        async (p) => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.getOrderTracking(
            p.order_id,
            k.apiKey,
          );
        },
      ),
      tool(
        'cancel_order',
        "Cancel one of the seller's orders. ONLY after explicit seller confirmation.",
        { order_id: { type: 'string' } },
        ['order_id'],
        async (p) => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.cancelOrder(p.order_id, k.apiKey);
        },
      ),
      tool(
        'delete_order',
        "Delete one of the seller's orders. ONLY after explicit seller confirmation.",
        { order_id: { type: 'string' } },
        ['order_id'],
        async (p) => {
          const k = await this.resolveSellerKey(input);
          if ('requires' in k) return { error: true, ...k };
          return this.burgerPrintToolService.deleteOrder(p.order_id, k.apiKey);
        },
      ),
      tool(
        'render_buttons',
        'Render clickable buttons in the chat — a GENERAL UX helper for ANY use case: quick replies, ' +
          'yes/no confirmations, offering a few choices (markets, sizes, factories...), or external links. ' +
          'Use it whenever tappable options make the next step easier than typing. ' +
          'Each button has: title (the label), action ("message" = clicking sends the title back to you as a ' +
          'chat message, like a quick reply; "link" = opens a URL in a new tab), and either message (text to ' +
          'send, defaults to title) or link (URL). ' +
          'One important case: right AFTER a real order is created, call this with a "link" button that opens ' +
          'the order on the BurgerPrints dashboard: https://dash.burgerprints.com/admin/order/<order_id>.',
        {
          buttons: {
            type: 'array',
            description: 'Buttons to show the seller',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Button label' },
                action: {
                  type: 'string',
                  enum: ['message', 'link'],
                  description:
                    'message = clicking sends the text back to you; link = opens the URL in a new tab',
                },
                message: {
                  type: 'string',
                  description:
                    'For action=message: the text sent back (defaults to title)',
                },
                link: {
                  type: 'string',
                  description: 'For action=link: the absolute URL to open',
                },
              },
              required: ['title', 'action'],
            },
          },
        },
        ['buttons'],
        (p) => {
          const buttons = (Array.isArray(p.buttons) ? p.buttons : [])
            .map((b: any) => {
              const label = String(b?.title ?? '').trim();
              const action = b?.action === 'link' ? 'link' : 'message';
              const value =
                action === 'link'
                  ? String(b?.link ?? '').trim()
                  : String(b?.message ?? b?.title ?? '').trim();
              return { label, action, value };
            })
            .filter((b: any) => b.label && b.value);
          return Promise.resolve({ render: 'buttons', buttons });
        },
      ),
      tool(
        'request_design_upload',
        'Render ONE in-chat upload card so the seller can upload the print file(s). ' +
          'ALWAYS call this when you need a design file — never just ask for it in text. ' +
          'Pass every side you need in ONE call: sides=["front"] for front only, or ' +
          'sides=["front","back"] when the back is printed too (the card shows one slot per side).',
        {
          sides: {
            type: 'array',
            description: 'Print sides to collect',
            items: { type: 'string', enum: ['front', 'back'] },
          },
        },
        [],
        (p) => {
          const raw = Array.isArray(p.sides) ? p.sides : [];
          const sides = ['front', 'back'].filter((s) => raw.includes(s));
          if (sides.length === 0) sides.push('front');
          const ref = `upload-${input.sessionId}-${input.history.length}`;
          return Promise.resolve({ render: 'upload_card', sides, ref });
        },
      ),
      tool(
        'validate_design',
        'Check whether an uploaded design file is a valid factory print resolution. ' +
          'Defaults to the most recent upload for the side. If invalid, tell the seller, ' +
          'offer auto resize/crop, and call render_buttons with a "Process now" button.',
        {
          side: {
            type: 'string',
            enum: ['front', 'back'],
            description: 'Default front',
          },
          image_id: {
            type: 'string',
            description: 'Specific asset id (optional)',
          },
        },
        [],
        async (p) => {
          if (!input.userId)
            return {
              requires: 'login',
              message: 'Please log in to manage design files',
            };
          const side = p.side === 'back' ? 'back' : 'front';
          const asset = p.image_id
            ? await this.designAssets.findById(p.image_id, input.userId)
            : await this.designAssets.latest(
                input.sessionId,
                input.userId,
                side,
              );
          if (!asset)
            return {
              error: true,
              code: 'NO_DESIGN',
              message: `No ${side} design uploaded yet`,
            };
          return {
            valid: asset.valid,
            width: asset.width,
            height: asset.height,
            side: asset.side,
            image_id: String(asset._id),
          };
        },
      ),
      tool(
        'process_design',
        'Auto resize/crop invalid design file(s) to a valid factory resolution and return the ' +
          'corrected image(s). Pass front_image_id and/or back_image_id (defaults to the latest ' +
          'upload per side). Show each returned image to the seller as a markdown image.',
        {
          front_image_id: {
            type: 'string',
            description: 'Front asset id (optional)',
          },
          back_image_id: {
            type: 'string',
            description: 'Back asset id (optional)',
          },
        },
        [],
        async (p) => {
          if (!input.userId)
            return {
              requires: 'login',
              message: 'Please log in to process design files',
            };
          const ids: string[] = [];
          if (p.front_image_id) ids.push(p.front_image_id);
          if (p.back_image_id) ids.push(p.back_image_id);
          if (ids.length === 0) {
            const front = await this.designAssets.latest(
              input.sessionId,
              input.userId,
              'front',
            );
            const back = await this.designAssets.latest(
              input.sessionId,
              input.userId,
              'back',
            );
            if (front && !front.valid) ids.push(String(front._id));
            if (back && !back.valid) ids.push(String(back._id));
          }
          if (ids.length === 0)
            return {
              error: true,
              code: 'NOTHING_TO_PROCESS',
              message: 'No invalid design to process',
            };
          const processed = [];
          for (const id of ids) {
            try {
              const a = await this.designAssets.process(id, input.userId);
              processed.push({
                side: a.side,
                image_id: a.image_id,
                url: a.url,
                width: a.width,
                height: a.height,
              });
            } catch (e) {
              this.logger.error(
                `process_design failed for ${id}: ${(e as Error).message}`,
              );
            }
          }
          if (processed.length === 0)
            return {
              error: true,
              code: 'PROCESS_FAILED',
              message: 'Could not process the design',
            };
          return { processed };
        },
      ),
      tool(
        'list_design_assets',
        'List the design files uploaded in this conversation (newest first) so the seller can ' +
          'pick which one to order with. Use when the seller says the default image is not the right one.',
        {},
        [],
        async () => {
          if (!input.userId)
            return {
              requires: 'login',
              message: 'Please log in to view design files',
            };
          return {
            assets: await this.designAssets.listByConversation(
              input.sessionId,
              input.userId,
            ),
          };
        },
      ),
      tool(
        'search_history',
        'Search the FULL conversation history (BM25) when the seller refers to something said earlier that is NOT in the current context (only the last N turns are included). Returns the most relevant past turns.',
        {
          query: {
            type: 'string',
            description:
              'Keyword/content to find again in earlier conversation',
          },
        },
        ['query'],
        (p) => this.memory.searchHistory(input.sessionId, p.query),
      ),
      tool(
        'retrieve_knowledge',
        "Look up internal how-to guides relevant to the seller's request. Call this at the START of every turn with the seller's message. If it returns a matching guide, follow that guide (its steps, checks, and follow-up questions); if it returns nothing, answer normally. Never mention guides/tools to the seller.",
        {
          query: {
            type: 'string',
            description:
              "The seller's request / question to find a relevant guide for",
          },
        },
        ['query'],
        (p) => this.knowledge.retrieve(p.query),
      ),
      tool(
        'fetch_url',
        'Fetch a public web page (http/https) and read its main content as clean Markdown. Use when the seller shares a link or asks about something on a specific page (a product page, an article, docs). Returns the page title + Markdown (long pages are truncated). Only public pages — internal/private addresses are refused.',
        {
          url: {
            type: 'string',
            description:
              'The absolute http(s) URL to fetch, e.g. "https://example.com/page"',
          },
        },
        ['url'],
        (p) => this.webFetch.fetchUrl(p.url),
      ),
      tool(
        'get_shipping',
        'Shipping fee + time of ONE factory to each country (carrier, first/additional item price). ' +
          'Get partner_id from compare_factories. Use to compare "which factory ships cheapest/fastest to country X" ' +
          'and to compute margin INCLUDING shipping.',
        {
          short_code: {
            type: 'string',
            description: 'Product short_code, e.g. "EUG2400"',
          },
          partner_id: {
            type: 'string',
            description:
              'Factory id (from compare_factories.factories[].partner_id)',
          },
          country: {
            type: 'string',
            description:
              'Filter by country (name or code, e.g. "US"/"Germany") — optional',
          },
        },
        ['short_code', 'partner_id'],
        (p) =>
          this.burgerPrintToolService.getShipping(
            p.short_code,
            p.partner_id,
            p.country,
          ),
      ),
      tool(
        'get_size_chart',
        'Size chart (measurements per size: e.g. Length, Bust in inch + cm) + a size-guide image URL, ' +
          'for ONE product. Use when the seller asks about sizing/measurements/fit.',
        {
          short_code: {
            type: 'string',
            description:
              'Product short_code, e.g. "USG5000" (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerPrintToolService.getSizeChart(p.short_code),
      ),
      tool(
        'get_product_detail',
        'Overview of ONE product (scalar fields): description, base cost range, print sides ' +
          '(front/back/sleeve), processing/production time, shipping summary (US/worldwide time + carriers), ' +
          'mockup image, color/size/factory counts. Call AFTER picking a product; use the dedicated array ' +
          'tools (get_product_colors, get_decorations, get_size_chart, compare_factories, get_product_variants, get_shipping) for details.',
        {
          short_code: {
            type: 'string',
            description:
              'Product short_code, e.g. "USG5000" (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerPrintToolService.getProductDetail_card(p.short_code),
      ),
      tool(
        'get_product_colors',
        'Full color list of ONE product (name + hex code). Use for "what colors are available" or to show swatches.',
        {
          short_code: {
            type: 'string',
            description: 'Product short_code (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerPrintToolService.getProductColors(p.short_code),
      ),
      tool(
        'get_decorations',
        'Print techniques/locations of ONE product (DTG / DTF / Sleeve Print) + design-file requirements ' +
          '(file format, size, DPI) and color-profile guideline. Use for "which print method", "can it print on the back/sleeve", "what file do I need".',
        {
          short_code: {
            type: 'string',
            description: 'Product short_code (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerPrintToolService.getDecorations(p.short_code),
      ),
      tool(
        'get_related_products',
        'Related/suggested products for ONE product (alternatives, upsell). Returns short_code + name.',
        {
          short_code: {
            type: 'string',
            description: 'Product short_code (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerPrintToolService.getRelatedProducts(p.short_code),
      ),
      tool(
        'calculate_margin',
        'Compute margin PRECISELY for one or more products (deterministic). Do NOT do the math yourself. ' +
          'Margin% = (sell − base − shipping)/sell × 100. Pass shipping_cost ONLY when you have a real number ' +
          'from get_shipping; omit it → base-only margin (excludes shipping).',
        {
          items: {
            type: 'array',
            description: 'List of products to compute',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Product name/code' },
                sell_price: {
                  type: 'number',
                  description: 'Intended sell price (USD)',
                },
                base_cost: { type: 'number', description: 'Base cost (USD)' },
                shipping_cost: {
                  type: 'number',
                  description:
                    'Real shipping cost from get_shipping (optional)',
                },
              },
              required: ['sell_price', 'base_cost'],
            },
          },
        },
        ['items'],
        (p) => Promise.resolve(this.calcMargin(p.items)),
      ),
    ];
  }

  /** Compute margin deterministically (server-side) — avoids the LLM doing the math wrong. */
  private calcMargin(items: any[]): unknown {
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      note: 'shipping_cost empty → base-only margin (excludes shipping). Get real shipping via get_shipping and pass it in for full margin.',
      results: (Array.isArray(items) ? items : []).map((it) => {
        const sell = Number(it.sell_price);
        const base = Number(it.base_cost);
        const ship = Number(it.shipping_cost) || 0;
        const total = base + ship;
        const profit = sell - total;
        return {
          label: it.label ?? null,
          sell_price: sell,
          base_cost: base,
          shipping_cost: ship || null,
          total_cost: round(total),
          profit: round(profit),
          margin_percent:
            sell > 0 ? Math.round((profit / sell) * 1000) / 10 : null,
        };
      }),
    };
  }
}

/** Default system prompt (exported so the controller can return it to the FE for editing). */
export function defaultSystemPrompt(): string {
  return [
    `You are BurgerPrintsAgent — a POD (print-on-demand) fulfillment catalog assistant for BurgerPrints sellers.`,
    `Goal: help sellers SEARCH, COMPARE and CHOOSE products / factories / SKUs to fulfill, using ONLY real data from the tools.`,
    ``,
    `LANGUAGE: Always reply in the SAME language as the seller's latest message (auto-detect).`,
    `STYLE: Be concise and focused — answer what the seller asked, and include the relevant supporting details (price, factory, sizes, key facts) so the answer is useful and complete. Don't be curt/one-liner: give enough context to act, but skip preamble, restating the question, and data they didn't ask for. Lead with the answer, then the supporting facts. Use a compact markdown table when comparing multiple items; a short paragraph or bullet list otherwise. Do NOT end every reply with a follow-up suggestion — offer a next step only when it genuinely helps, in one short line.`,
    `VOICE: Talk like a friendly, knowledgeable POD consultant — natural and human, NOT technical. Present information as your own findings; never expose the machinery — do NOT mention "tools", "the API", "the data returned", function/field names (base_cost, partner_id, short_code, catalog_sku, metadata), or your internal steps. Use plain business wording (base cost, factory, shipping fee, product code), not raw field names. Never write phrases like "here is the data the tool returned" or "the tool found ..."; just state the answer as if you simply know it. If something is unavailable, say so plainly (e.g. "I don't have a shipping quote to that country yet") without blaming a tool/API. Show SKUs/codes only when the seller needs them to order, as product info — not as internal jargon.`,
    ``,
    `TOOLS & WORKFLOW:`,
    `1. search_products(category, market?, max_base_cost?) → products by type/FEATURE in a market, with base_cost (lowest), cheapest factory, color count, sorted by price. category is full-text over name + description, so you can search by material ("cotton", "ring-spun"), print technique ("DTG"/"DTF") or feature ("long sleeve", "fleece"). Pass max_base_cost to filter by budget. Use FIRST to discover products or list the sub-types of a category. IMPORTANT: if the seller names a SPECIFIC product/model (e.g. "Bella + Canvas 3001", "Gildan 18600"), pass that exact name as category (matching is token/punctuation-insensitive) — do NOT search the generic type, because results are sorted by price and capped, so a specific (pricier) model would be hidden. If total_matched > products returned and you don't see the named product, refine the keyword before concluding it doesn't exist. LANGUAGE: the catalog is in ENGLISH — category MUST be an English keyword. Translate the seller's word from any language to the English catalog term (a generic "shirt/tee" word → "t-shirt", an outerwear word → "hoodie"/"jacket", a "pants/trousers" word → "pants"). If the product type is generic or unclear, OMIT category and filter by max_base_cost only (then summarize the cheapest options) — never pass a non-English word as category.`,
    `2. compare_factories(short_code) → base cost per factory (partner_name) + sizes/colors for ONE product. Use after a specific product is chosen, to compare factories or for margin.`,
    `3. get_product_variants(short_code, color?, size?, factory?) → concrete SKUs (sku, color, size, price, in_stock) for a product. Use for specific color/size or before ordering.`,
    `4. create_order(shipping, item, sandbox?) → place a single-item fulfillment order. See ORDER FLOW below.`,
    `5. search_history(query) → search the FULL conversation history (BM25). Only the last few turns are in your context; if the seller refers to something said earlier that you don't see, call search_history to retrieve it instead of guessing or saying you forgot.`,
    `6. get_shipping(short_code, partner_id, country?) → shipping fee + time per country for ONE factory (partner_id from compare_factories). Use to answer "which factory ships cheapest/fastest to country X" and to compute margin INCLUDING shipping.`,
    `7. Order flow tools: check_auth, require_seller_key, get_balance, charge_order, list_orders, get_order, get_order_tracking, cancel_order, delete_order. See ORDER FLOW below.`,
    ``,
    `ORDER FLOW (placing & paying for an order — follow EXACTLY, never skip a gate):`,
    `- GATE 0 (auth): the FIRST time an order is requested, call check_auth ONCE. If not logged in, STOP and ask the seller to log in (a login prompt appears automatically); do not collect SKU/design/address from a guest. Once it returns logged_in, do NOT call check_auth again for the rest of the conversation — the money/account tools self-check anyway.`,
    `- STEP A (SKU): use search_products → get_product_variants to settle the exact catalog_sku + quantity; never order an out-of-stock SKU.`,
    `- STEP B (design / print file): the ONLY way to ask for a design is to call request_design_upload(sides) — this renders the upload card. NEVER tell the seller "upload here" / "I've opened a spot to upload" / "send me the file" in text WITHOUT calling request_design_upload in that SAME turn; if you mention uploading, you MUST call the tool. Pass every side you need in that one call: sides=["front"] for front only, or sides=["front","back"] when the back is printed (the card shows one slot per side). You can render the card early (even while still settling the product) — it does not need the SKU. After the seller uploads, call validate_design. If it is NOT a valid print resolution, tell the seller, offer auto resize/crop, and call render_buttons with a "Process now" button.`,
    `- PROCESS NOW (critical): if the seller replies "Process now" (or otherwise agrees to fix the file), your IMMEDIATE next action MUST be to call process_design — do not move on to address/draft/order first, and do not just re-list steps. After it returns, show the corrected image(s) as markdown and continue. While the front design is still invalid, do NOT create the order — fix it with process_design first. The order needs a valid front print file.`,
    `- DESIGN SELECTION: ordering uses the latest valid uploaded image per side automatically (you don't need to pass URLs). If the seller says that's not the right image, call list_design_assets and offer the options with render_buttons; pass the chosen design_asset_id_front/back to create_order.`,
    `- CONTINUITY (important): carry forward details already established earlier in THIS conversation — the chosen SKU/color/size, quantity, uploaded design, and address. NEVER ask the seller to re-type something they already gave. If a detail scrolled out of your visible context, recover it: call search_history for the chosen product/SKU, and remember the design is auto-resolved from the latest valid upload (call list_design_assets to confirm one exists). Only ask the seller again if recovery genuinely fails.`,
    `- STEP C (address): collect shipping name/address1/city/state/zip/country (2-letter state for US, 2-letter country code). Re-ask for any missing/invalid field; never invent address data.`,
    `- GATE KEY: before creating the order, call require_seller_key. If no key, STOP and ask the seller to add their BurgerPrints API key in settings (a settings prompt appears automatically). (Do NOT use sandbox — it cannot quote a price.)`,
    `- GATE 1 (create + quote): after the seller confirms the item, call create_order. This places an UNPAID order ("draft") and RETURNS the price — show the seller base cost + shipping fee + total from the result's amounts. It is NOT paid yet. (No sandbox preview; the unpaid order IS the quote.) If create_order returns an error, tell the seller it failed and what to fix — NEVER claim an order was created when it errored. If it succeeds but amounts is null (price still computing), call list_orders and read amount + shipping_fee for that order_id to quote. On a successful create you MUST, in the SAME reply, also call render_buttons with TWO buttons: a "link" button "View order on dashboard" → https://dash.burgerprints.com/admin/order/<order_id>, and a "message" button "Pay now". This is REQUIRED — never end the turn after a successful create without these buttons.`,
    `- GATE 2 (charge): SEPARATELY, only after the seller explicitly confirms payment, call get_balance; if funds are sufficient call charge_order(order_id). If insufficient, do NOT charge — tell the seller to top up. NEVER chain create→charge automatically. If the seller declines or wants changes, delete_order the unpaid order.`,
    `- AFTER: use list_orders for "my orders / order history", get_order / get_order_tracking for one order's status; cancel_order / delete_order only after explicit confirmation.`,
    ``,
    `BUTTONS (UX): render_buttons is a general helper — use it whenever tappable options help, not only for orders: yes/no confirmations (e.g. "Place the real order" / "Not yet"), a few choices (markets, sizes, factories), or a useful external link. action "message" sends the label back as the seller's reply (a quick reply); action "link" opens a URL. Keep to 2-4 short buttons; don't overuse them on every message.`,
    `- If any order tool returns that login or an API key is required, STOP and ask the seller to do that step (the popup is shown for them) — do not retry blindly or expose tool/field names.`,
    ``,
    `SHORT_CODE RULE (critical): compare_factories / get_product_variants / get_shipping need a short_code. You MUST obtain short_code from a search_products result — NEVER invent or guess it (e.g. do not assume "EU3001" or "USBC3001"). If the seller names a product but you don't have its exact short_code, call search_products FIRST to resolve it, then use the returned short_code. A wrong short_code returns a 400 error.`,
    `KNOWLEDGE FIRST: At the START of every turn, call retrieve_knowledge — but pass a SELF-CONTAINED query that resolves the conversation context, NOT the seller's raw words. If the latest message is a short follow-up (just a country name, "thì sao?", "cái kia", a number...), expand it using the active topic so the query stands on its own — e.g. while discussing VAT and the seller types only "Germany", query "VAT tax rate for Germany", not "Germany". If it returns a matching guide, follow that guide's approach (its steps, what to check, what to ask back). If it returns nothing relevant, just answer normally. Never mention guides, knowledge, or tools to the seller — treat any guide as your own expertise.`,
    `TOOL AUTONOMY: Decide and call tools YOURSELF to answer. NEVER ask the seller for permission to use a tool ("do you want me to compare factories / check shipping / look up SKUs?") — just call it and give the answer. Chain tools as needed (search → detail → variants → shipping → margin) without pausing. Only ask the seller for missing INFORMATION you truly cannot proceed without (e.g. destination country for a shipping quote), never for permission to act.`,
    `ACT, DON'T PROMISE (critical): if you say you will do something ("I'll process the file now", "let me get the right variant", "I'll create the order"), you MUST call the matching tool in the SAME turn, BEFORE ending your message — never announce an action and then stop, forcing the seller to nudge you ("did you do it yet?", "go ahead"). Specifically: to get/confirm a catalog_sku, call get_product_variants yourself (you have the product + color + size) — do NOT ask the seller for the variant code or say the SKU is "invalid" without immediately re-fetching it; on "Process now", call process_design immediately. If a step is doable with a tool, do it now rather than describing it.`,
    `DISAMBIGUATION: a category can have many sub-types (Hoodie = Pullover / Zip-up / Crop / Kids...). If the seller's request is broad, call search_products and present the matching sub-types/products (a compact table) and proceed with the comparison/answer for the most relevant ones — do NOT stop just to ask "which one?". Ask only if the choice genuinely changes the answer and you cannot reasonably pick. If seller says "all", group by sub-type (one section each); never merge different products into one table.`,
    ``,
    `KEY DATA FACTS:`,
    `- "Factory" = partner_name. One product is fulfilled by MANY factories at different base costs.`,
    `- "price" = base cost of the 1st item; "2nd_price" = cost from the 2nd item onward.`,
    `- Market is inferred from short_code prefix (US.., EU.., AP..=CN).`,
    `- in_stock=false → SKU is out of stock; don't recommend/order it.`,
    `- Shipping fee/time by destination ARE available via get_shipping (per factory, per country); compare_factories returns processing_time per factory. Factory rating is NOT available — never invent it.`,
    `- TOTAL cost to a destination = base cost (compare_factories) + shipping first_item_price (get_shipping). Use this for accurate margin and "cheapest/fastest to country X".`,
    ``,
    `MARGIN: To compute margin you MUST call calculate_margin (do NOT do the arithmetic yourself — it has been wrong). Pass an items array with ONE entry PER product you are presenting, where base_cost is THAT product's real base_cost from the search_products result (e.g. 5.10, 7.25, 7.40) — NOT a budget cap/threshold/rounded number, and not a single placeholder. shipping_cost: include ONLY if you got a real number from get_shipping; otherwise omit it → base-only margin, state the caveat. Never assume/guess a shipping number. For "min margin X% at sell price P", max allowed base cost = P × (1 − X/100) — compute that and call search_products(max_base_cost=that), then still call calculate_margin with each product's real base_cost to show the actual margin.`,
    ``,
    `BEHAVIOR:`,
    `- ACT FIRST, refine later: if the query has anything actionable (a price, a margin, a product type, a budget), call the tools and SHOW results immediately, then offer to narrow (e.g. by market/type). Do NOT block with clarifying questions when you can already search. Example: "sell shirts at $25 with 40% margin" → compute max base cost ($15), search_products(category:"t-shirt", max_base_cost:15), show products with margins — THEN ask if they want a specific market/type.`,
    `- Only ask a clarifying question when the query is truly empty of actionable info ("I want to sell something") — at most 1 short question, and still suggest a default.`,
    `- FORMATTING: GitHub-Markdown. Money uses a plain "$" (e.g. $15) — NEVER write a single "$" as a math delimiter. For a formula use a block: $$ ... $$ (or \\[ ... \\], which the UI converts). Inside a formula use SHORT ASCII labels only (e.g. $$ MaxBaseCost = 25 \\times (1 - 0.40) = 15 $$) — do NOT put full Vietnamese/English sentences or accented words inside \\text{} (KaTeX renders them garbled). Often a one-line plain-text formula is clearest: "max base cost = 25 × (1 − 0.40) = $15".`,
    `- No match → relax the filter and suggest the closest options; never return empty-handed silently.`,
    `- Out-of-scope question → politely redirect to the BurgerPrints POD catalog.`,
    `- NEVER invent catalog data, prices, factories or SKUs. If a tool returns an error, tell the seller you couldn't fetch the data.`,
    `- Only suggest a next step when it clearly helps; do not force a suggestion onto every answer.`,
  ].join('\n');
}

/**
 * Models the FE can choose from. Override via env LLM_AVAILABLE_MODELS
 * (e.g. "gpt-4o,gpt-4o-mini,claude-sonnet-4-5"). Note: the model must be valid for
 * the configured provider (LLM_PROVIDER) — otherwise it errors at runtime.
 */
export const AVAILABLE_MODELS: Array<{ id: string; label: string }> = process
  .env.LLM_AVAILABLE_MODELS
  ? process.env.LLM_AVAILABLE_MODELS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => ({ id, label: id }))
  : [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
    ];

/** Tool summaries (name + meaning) for the FE to show to the prompt editor. */
export const AGENT_TOOLS_INFO: Array<{ name: string; desc: string }> = [
  {
    name: 'search_products',
    desc: 'Find products by type/feature + market + max base cost. category is full-text over name + description (material "cotton"/"ring-spun", print technique DTG/DTF, features "long sleeve"/"fleece"). Returns base_cost (lowest), cheapest factory, color count — sorted by price.',
  },
  {
    name: 'compare_factories',
    desc: 'Compare ALL factories of ONE product (short_code): min/max base cost per factory + sizes/colors. Use after a specific product is chosen, or for margin.',
  },
  {
    name: 'get_product_variants',
    desc: 'List concrete SKUs of a product (color/size/price/factory), with catalog_sku (order code) and in_stock. Use for a specific color/size or before ordering.',
  },
  {
    name: 'create_order',
    desc: "Place a single-item UNPAID order (BurgerPrints 'draft') on the seller's account and return its price (base + shipping + total) for quoting. Uses the seller's key; charge_order pays it. Not sandbox.",
  },
  {
    name: 'check_auth',
    desc: 'Check whether the seller is logged in (called before collecting order info). If not, the FE shows a login prompt and the agent stops.',
  },
  {
    name: 'require_seller_key',
    desc: 'Check whether the seller configured their own BurgerPrints API key (called at the draft→real-order boundary). If not, the FE shows a settings prompt.',
  },
  {
    name: 'get_balance',
    desc: "Read the seller's BurgerPrints wallet balance (their own key). Used before charging.",
  },
  {
    name: 'charge_order',
    desc: "Charge/pay a created order from the seller's wallet (gate 2). Only after explicit payment confirmation; never auto-chained after create_order.",
  },
  {
    name: 'list_orders',
    desc: 'List the seller\'s orders (paginated, newest first) — for "show my orders / order history". Uses their own key.',
  },
  {
    name: 'get_order',
    desc: "Get status/details of one of the seller's orders (their own key).",
  },
  {
    name: 'get_order_tracking',
    desc: 'Get tracking info for one of the seller\'s orders; says "not available yet" when there is none.',
  },
  {
    name: 'cancel_order',
    desc: "Cancel one of the seller's orders. Only after explicit confirmation.",
  },
  {
    name: 'delete_order',
    desc: "Delete one of the seller's orders. Only after explicit confirmation.",
  },
  {
    name: 'render_buttons',
    desc: 'Render clickable buttons in chat (quick replies / links). Used e.g. after creating an order to show an "Open on dashboard" link button.',
  },
  {
    name: 'request_design_upload',
    desc: 'Render ONE in-chat upload card with a slot per side (pass sides=["front"] or ["front","back"]). Always used instead of asking for a design in text.',
  },
  {
    name: 'validate_design',
    desc: 'Check an uploaded design file against the allowed factory print resolutions; if invalid, offer auto resize/crop.',
  },
  {
    name: 'process_design',
    desc: 'Auto resize/crop invalid design file(s) to a valid factory resolution and return the corrected image(s).',
  },
  {
    name: 'list_design_assets',
    desc: "List the conversation's uploaded design files (newest first) so the seller can pick which one to order with.",
  },
  {
    name: 'search_history',
    desc: 'Search past conversation history (BM25) when the seller refers to something said earlier that is no longer in the current context (only the last N turns are loaded).',
  },
  {
    name: 'retrieve_knowledge',
    desc: "Look up internal how-to guides relevant to the seller's request (called every turn). If a guide matches, the agent follows it; otherwise it answers normally.",
  },
  {
    name: 'fetch_url',
    desc: 'Fetch a public http(s) page and read its main content as clean Markdown (article extraction). Use when the seller shares a link or asks about a specific web page. Private/internal addresses are refused.',
  },
  {
    name: 'get_shipping',
    desc: 'Shipping fee + time of one factory (partner_id from compare_factories) to each country (carrier, first/additional item price). Use for "cheapest/fastest to country X" and margin including shipping.',
  },
  {
    name: 'get_size_chart',
    desc: 'Size chart of a product (measurements per size — e.g. Length, Bust in inch + cm) + size-guide image. Use for sizing/measurement/fit questions.',
  },
  {
    name: 'get_product_detail',
    desc: 'Overview of ONE product (scalar): description, base cost range, print sides, processing/production time, shipping summary (US/WW), mockup image, color/size/factory counts. Use the array tools for details.',
  },
  {
    name: 'get_product_colors',
    desc: 'Full color list of a product (name + hex). Use for "what colors are available".',
  },
  {
    name: 'get_decorations',
    desc: 'Print techniques (DTG/DTF/Sleeve) + design-file requirements (format, size, DPI) of a product. Use for print method / printable sides / file requirements.',
  },
  {
    name: 'get_related_products',
    desc: 'Related/suggested products (alternatives, upsell) for a product.',
  },
  {
    name: 'calculate_margin',
    desc: 'Compute margin precisely (deterministic) for one or more products: (sell − base − shipping)/sell × 100. The agent MUST use this tool instead of mental math.',
  },
];
