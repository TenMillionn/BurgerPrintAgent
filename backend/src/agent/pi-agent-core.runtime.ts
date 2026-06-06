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
  ) {}

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

    let agent: any;
    try {
      // pi-ai reads the API key from env (ANTHROPIC_API_KEY / OPENAI_API_KEY).
      const openaiBaseUrl = this.config.get<string>('llm.openaiBaseUrl');
      let model: any;

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
    let done = false;
    let wake: (() => void) | null = null;
    const push = (c: AgentChunk) => {
      queue.push(c);
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
          push({
            type: 'tool',
            id: event.toolCallId,
            name: event.toolName,
            status: 'running',
          });
          break;
        case 'tool_execution_end': {
          const details = event.result?.details ?? event.result;
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
          if (errorMessage) {
            push({
              type: 'error',
              code: 'AGENT_RUNTIME_ERROR',
              message: errorMessage,
            });
          } else {
            push({ type: 'done', finishReason: 'stop' });
          }
          done = true;
          if (wake) {
            wake();
            wake = null;
          }
          break;
        }
      }
    });

    // Kick off the agent loop (not awaited here so we consume events while it runs).
    agent.prompt(input.message).catch((err: Error) => {
      void this.agentLog.turnEnd(input.sessionId, {
        reply: finalText,
        finishReason: 'error',
        error: err.message,
        duration_ms: Date.now() - startedAt,
      });
      push({ type: 'error', code: 'AGENT_PROMPT_ERROR', message: err.message });
      done = true;
      if (wake) {
        wake();
        wake = null;
      }
    });

    // Consume the queue; stop when done and empty.
    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as AgentChunk;
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => (wake = resolve));
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
      if (oid)
        items = [
          { title: `Order ${oid}`, meta: details.sandbox ? 'sandbox' : 'live' },
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
        'Create a fulfillment order (bonus). Default sandbox=true (no real order). ' +
          'ONLY call after the seller confirms SKU + quantity + shipping address. Set sandbox=false only when the seller confirms a real order.',
        {
          shipping: {
            type: 'object',
            description: 'Shipping recipient info',
            properties: {
              name: { type: 'string' },
              address1: { type: 'string' },
              address2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string', description: 'Country code, e.g. US' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['name', 'address1', 'city', 'state', 'zip', 'country'],
          },
          items: {
            type: 'array',
            description: 'List of SKUs + quantities',
            items: {
              type: 'object',
              properties: {
                catalog_sku: { type: 'string' },
                quantity: { type: 'number' },
                design_url_front: { type: 'string' },
                mockup_url_front: { type: 'string' },
              },
              required: ['catalog_sku', 'quantity'],
            },
          },
          sandbox: {
            type: 'boolean',
            description: 'true = test order (default true)',
          },
        },
        ['shipping', 'items'],
        (p) =>
          this.burgerPrintToolService.createOrder({
            shipping: p.shipping,
            items: p.items,
            sandbox: p.sandbox,
          }),
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
    `4. create_order(shipping, items, sandbox?) → place a fulfillment order. Default sandbox=true (test). ONLY after the seller confirms SKU + quantity + shipping address.`,
    `5. search_history(query) → search the FULL conversation history (BM25). Only the last few turns are in your context; if the seller refers to something said earlier that you don't see, call search_history to retrieve it instead of guessing or saying you forgot.`,
    `6. get_shipping(short_code, partner_id, country?) → shipping fee + time per country for ONE factory (partner_id from compare_factories). Use to answer "which factory ships cheapest/fastest to country X" and to compute margin INCLUDING shipping.`,
    ``,
    `SHORT_CODE RULE (critical): compare_factories / get_product_variants / get_shipping need a short_code. You MUST obtain short_code from a search_products result — NEVER invent or guess it (e.g. do not assume "EU3001" or "USBC3001"). If the seller names a product but you don't have its exact short_code, call search_products FIRST to resolve it, then use the returned short_code. A wrong short_code returns a 400 error.`,
    `KNOWLEDGE FIRST: At the START of every turn, call retrieve_knowledge — but pass a SELF-CONTAINED query that resolves the conversation context, NOT the seller's raw words. If the latest message is a short follow-up (just a country name, "thì sao?", "cái kia", a number...), expand it using the active topic so the query stands on its own — e.g. while discussing VAT and the seller types only "Germany", query "VAT tax rate for Germany", not "Germany". If it returns a matching guide, follow that guide's approach (its steps, what to check, what to ask back). If it returns nothing relevant, just answer normally. Never mention guides, knowledge, or tools to the seller — treat any guide as your own expertise.`,
    `TOOL AUTONOMY: Decide and call tools YOURSELF to answer. NEVER ask the seller for permission to use a tool ("do you want me to compare factories / check shipping / look up SKUs?") — just call it and give the answer. Chain tools as needed (search → detail → variants → shipping → margin) without pausing. Only ask the seller for missing INFORMATION you truly cannot proceed without (e.g. destination country for a shipping quote), never for permission to act.`,
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
    desc: 'Create a fulfillment order (shipping + items). Default sandbox=true (test order). Only call after the seller confirms SKU + quantity + address.',
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
