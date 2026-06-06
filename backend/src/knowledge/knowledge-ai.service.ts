import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeneratedMetadata {
  summary: string;
  keywords: string[];
  intents: string[];
  sampleQuestions: string[];
}

/**
 * Generates retrieval metadata for a guide by asking the configured
 * OpenAI-compatible model to summarize it and emit search hints as JSON.
 * Throws on failure so the caller can mark the guide 'pending' (reprocessable).
 */
@Injectable()
export class KnowledgeAiService {
  private readonly logger = new Logger(KnowledgeAiService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(content: string): Promise<GeneratedMetadata> {
    const apiKey = this.config.get<string>('llm.openaiApiKey');
    const baseUrl =
      this.config.get<string>('llm.openaiBaseUrl') || 'https://api.openai.com/v1';
    const model = this.config.get<string>('llm.model') || 'gpt-4o';
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured for metadata generation');
    }

    const system =
      'You extract retrieval metadata from a help guide. Reply with ONLY a JSON object ' +
      '{"summary": string, "keywords": string[], "intents": string[], "sampleQuestions": string[]}. ' +
      'summary: 1-2 sentences. keywords: 5-12 search terms. intents: 3-6 short snake_case intent labels ' +
      '(e.g. calculate_profit, compare_shipping). sampleQuestions: 3-6 questions a user might ask that this guide answers. ' +
      'No markdown, no commentary.';

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: content.slice(0, 12000) },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Metadata LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as any;
    const raw = data?.choices?.[0]?.message?.content ?? '';
    return this.coerce(raw);
  }

  /** Parse + normalize the model output into a valid GeneratedMetadata. */
  private coerce(raw: string): GeneratedMetadata {
    let obj: any;
    try {
      // Strip accidental code fences if a model added them despite instructions.
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      obj = JSON.parse(cleaned);
    } catch {
      throw new Error('Metadata LLM returned non-JSON output');
    }
    const arr = (v: any): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
    return {
      summary: String(obj.summary ?? '').trim(),
      keywords: arr(obj.keywords),
      intents: arr(obj.intents),
      sampleQuestions: arr(obj.sampleQuestions),
    };
  }
}
