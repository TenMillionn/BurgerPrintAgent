import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000; // cap downloaded HTML (~2 MB)
const MAX_MARKDOWN_CHARS = 12_000; // cap what we feed the agent
const MAX_REDIRECTS = 4;

export interface FetchResult {
  url: string;
  title: string;
  markdown: string;
  truncated: boolean;
  note?: string;
}

/**
 * Fetches a public web page and returns clean Markdown for the agent.
 * Hardened against SSRF: only http/https, DNS-resolved IP must be public,
 * redirects re-validated, bounded size + timeout. Runs server-side so these
 * guards are essential (the agent must not be steered to internal services).
 */
@Injectable()
export class WebFetchService {
  private readonly logger = new Logger(WebFetchService.name);
  private readonly turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  async fetchUrl(rawUrl: string): Promise<FetchResult> {
    const start = (rawUrl ?? '').trim();
    let url: URL;
    try {
      url = new URL(start);
    } catch {
      return this.error(start, 'Invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return this.error(start, 'Only http and https URLs are allowed');
    }

    let current = url;
    let html = '';
    let contentType = '';
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await this.assertPublicHost(current.hostname);
        const res = await this.rawFetch(current);
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          current = new URL(res.headers.get('location') as string, current);
          if (current.protocol !== 'http:' && current.protocol !== 'https:') {
            return this.error(current.href, 'Redirect to a non-http(s) URL');
          }
          continue;
        }
        if (!res.ok) {
          return this.error(current.href, `Fetch failed: HTTP ${res.status}`);
        }
        contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          return this.error(current.href, `Unsupported content type: ${contentType || 'unknown'}`);
        }
        html = await this.readBounded(res);
        break;
      }
    } catch (err: any) {
      return this.error(current.href, err?.message || 'Fetch error');
    }

    if (contentType.includes('text/plain')) {
      const md = html.slice(0, MAX_MARKDOWN_CHARS);
      return {
        url: current.href,
        title: current.hostname,
        markdown: md,
        truncated: html.length > MAX_MARKDOWN_CHARS,
      };
    }

    return this.htmlToMarkdown(html, current.href);
  }

  // ── HTML → Markdown (Readability article extraction, fallback to body) ──
  private htmlToMarkdown(html: string, url: string): FetchResult {
    let title = '';
    let contentHtml = '';
    try {
      const dom = new JSDOM(html, { url });
      const doc = dom.window.document;
      title = doc.title || '';
      doc.querySelectorAll('script,style,noscript,svg,iframe').forEach((n) => n.remove());
      const article = new Readability(doc).parse();
      if (article?.content) {
        title = article.title || title;
        contentHtml = article.content;
      } else {
        contentHtml = doc.body?.innerHTML || html;
      }
    } catch (err) {
      this.logger.warn(`HTML parse failed, using raw: ${err}`);
      contentHtml = html;
    }

    let markdown = '';
    try {
      markdown = this.turndown.turndown(contentHtml).trim();
    } catch {
      markdown = contentHtml.replace(/<[^>]+>/g, ' ');
    }
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    const truncated = markdown.length > MAX_MARKDOWN_CHARS;
    return {
      url,
      title: title.trim() || new URL(url).hostname,
      markdown: truncated ? markdown.slice(0, MAX_MARKDOWN_CHARS) + '\n\n…[truncated]' : markdown,
      truncated,
    };
  }

  // ── Networking with guards ─────────────────────────────────────────────
  private async rawFetch(u: URL): Promise<Response> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(u.href, {
        method: 'GET',
        redirect: 'manual', // we follow + re-validate each hop ourselves
        signal: ac.signal,
        headers: {
          'User-Agent': 'BurgerPrintsAgent/1.0 (+https://burgerprint.vocatee.com)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Read the body but stop after MAX_BYTES to avoid huge downloads. */
  private async readBounded(res: Response): Promise<string> {
    if (!res.body) return await res.text();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  /** Ensure every resolved IP for the host is public (block SSRF targets). */
  private async assertPublicHost(hostname: string): Promise<void> {
    const host = hostname.replace(/^\[|\]$/g, '');
    let addrs: { address: string }[];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      throw new Error('Could not resolve host');
    }
    if (addrs.length === 0) throw new Error('Could not resolve host');
    for (const { address } of addrs) {
      if (this.isPrivateIp(address)) {
        throw new Error('Refusing to fetch a private/internal address');
      }
    }
  }

  private isPrivateIp(ip: string): boolean {
    const v4 = ip.includes('.') ? ip.replace(/^::ffff:/i, '') : '';
    if (v4 && /^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
      const p = v4.split('.').map(Number);
      if (p[0] === 10) return true;
      if (p[0] === 127) return true; // loopback
      if (p[0] === 0) return true;
      if (p[0] === 169 && p[1] === 254) return true; // link-local + cloud metadata
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
      if (p[0] === 192 && p[1] === 168) return true;
      if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
      return false;
    }
    // IPv6
    const v6 = ip.toLowerCase();
    if (v6 === '::1') return true; // loopback
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // unique-local
    if (v6.startsWith('fe80')) return true; // link-local
    if (v6 === '::') return true;
    return false;
  }

  private error(url: string, note: string): FetchResult {
    return { url, title: '', markdown: '', truncated: false, note };
  }
}
