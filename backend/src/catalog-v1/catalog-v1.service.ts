import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

/**
 * Client cho catalog-api.burgerprints.com/api/v1/catalogsV2 — API catalog GIÀU hơn v2,
 * có dữ liệu mà api.burgerprints.com/v2 KHÔNG có: shipping theo xưởng theo nước,
 * processing time theo xưởng, decorations (kỹ thuật in). **Public, không cần auth.**
 *
 * partnerId ở đây KHỚP với partner_id của v2 (đã verify) → dùng chung.
 */
@Injectable()
export class CatalogV1Service {
  private readonly logger = new Logger(CatalogV1Service.name);
  private readonly baseUrl =
    process.env.CATALOG_V1_BASE_URL ??
    'https://catalog-api.burgerprints.com/api/v1/catalogsV2';

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Phí + thời gian ship của MỘT xưởng (partnerId) tới từng nước.
   * country (tùy chọn): lọc theo tên/mã nước. Sort theo giá tăng dần.
   */
  async getShipping(
    shortCode: string,
    partnerId: string,
    country?: string,
  ): Promise<unknown> {
    const data = await this.getCached(
      `/locations?shortCode=${encodeURIComponent(shortCode)}&partnerId=${encodeURIComponent(partnerId)}`,
    );
    if (!Array.isArray(data)) return data; // lỗi có cấu trúc

    let rows = data
      .filter((x: any) => Array.isArray(x.details) && x.details.length)
      .map((x: any) => {
        const d = x.details[0];
        return {
          country: x.countryName,
          country_code: x.countryCode,
          method: d.name,
          time: d.description,
          carrier: d.carriers,
          first_item_price: parseFloat(d.firstItemPrice),
          additional_item_price: parseFloat(d.additionalItemPrice),
        };
      });

    if (country) {
      const q = country.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.country?.toLowerCase().includes(q) ||
          r.country_code?.toLowerCase() === q,
      );
    }
    rows.sort((a, b) => a.first_item_price - b.first_item_price);

    return {
      short_code: shortCode,
      partner_id: partnerId,
      total_countries: rows.length,
      note: 'first_item_price = shipping for the first item; additional_item_price = per extra item; time = delivery time.',
      shipping: rows.slice(0, country ? 25 : 50),
    };
  }

  /** shortCode → alias (cần cho endpoint /alias/{alias}). Map từ /search (cache). */
  private async getAlias(shortCode: string): Promise<string | null> {
    const data: any = await this.getCached('/search?pageSize=1000&pageIndex=1');
    const content: any[] = data?.content ?? [];
    const p = content.find((x) => x.shortCode === shortCode);
    return p?.alias ?? p?.aliasName ?? null;
  }

  /** Detail thô của catalog-v1 (alias → /alias/{alias}, cache). null nếu không tìm thấy. */
  private async getDetail(shortCode: string): Promise<any | null> {
    const alias = await this.getAlias(shortCode);
    if (!alias) return null;
    const d: any = await this.getCached(`/alias/${encodeURIComponent(alias)}`);
    return d && !d.error ? d : null;
  }

  /** Field thường (scalar) cho get_product_detail: desc, time, shipping summary, mockup. */
  async getCatalogInfo(shortCode: string): Promise<{
    description: string | null;
    currency: string | null;
    processing_time: string | null;
    production_time: string | null;
    shipping_summary: unknown;
    mockup_image: string | null;
  } | null> {
    const d = await this.getDetail(shortCode);
    if (!d) return null;
    const sh = d.shipping || {};
    return {
      description: d.desc || null,
      currency: d.currency || null,
      processing_time: d.processingTime || null,
      production_time: d.productionTime || null,
      shipping_summary:
        sh.shippingTimeUs || sh.shippingLines
          ? {
              carriers: (sh.shippingLines || '').trim() || null,
              time_us: (sh.shippingTimeUs || '').trim() || null,
              time_worldwide: (sh.shippingTimeWw || '').trim() || null,
            }
          : null,
      mockup_image: d.media?.[0]?.url || null,
    };
  }

  /** Kỹ thuật in + yêu cầu file thiết kế (decorations[].designGuideline). */
  async getDecorations(shortCode: string): Promise<unknown> {
    const d = await this.getDetail(shortCode);
    if (!d) {
      return {
        error: true,
        code: 'NO_ALIAS',
        message: `Product ${shortCode} not found in catalog-v1.`,
      };
    }
    const decorations = (d.decorations ?? []).map((dec: any) => {
      const g = dec.designGuideline || {};
      return {
        technique: dec.name,
        file_format: g.fileFormat?.content || null,
        color_profile: g.colorProfile?.content || null,
        warning: g.warning?.content || null,
      };
    });
    return {
      short_code: shortCode,
      note: 'technique = print method/location (DTG/DTF/Sleeve Print); file_format = design-file requirement.',
      decorations,
    };
  }

  /** Sản phẩm liên quan/gợi ý (baseInterested). */
  async getRelatedProducts(shortCode: string): Promise<unknown> {
    const d = await this.getDetail(shortCode);
    if (!d) {
      return {
        error: true,
        code: 'NO_ALIAS',
        message: `Product ${shortCode} not found in catalog-v1.`,
      };
    }
    const related = (d.baseInterested ?? []).map((b: any) => ({
      short_code: b.shortCode,
      name: b.name,
    }));
    return { short_code: shortCode, total: related.length, related };
  }

  /**
   * Bảng size (số đo theo size) của sản phẩm — từ field `sizeChart` của catalog-v1.
   * Trả nhãn cột (vd Length/Bust), số đo in+cm mỗi size, và ảnh size guide.
   */
  async getSizeChart(shortCode: string): Promise<unknown> {
    const d = await this.getDetail(shortCode);
    if (!d) {
      return {
        error: true,
        code: 'NO_ALIAS',
        message: `Product ${shortCode} not found in catalog-v1.`,
      };
    }
    const raw = d?.sizeChart;
    if (!raw) {
      return {
        short_code: shortCode,
        message: 'This product has no size chart.',
      };
    }
    let sc: any;
    try {
      sc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return {
        short_code: shortCode,
        message: 'Size chart has an invalid format.',
      };
    }
    const columns: string[] = sc.column ?? [];
    const sizes = (sc.size ?? []).map((s: string, i: number) => {
      const row: Record<string, unknown> = { size: s };
      (sc.data?.[i] ?? []).forEach((v: any, j: number) => {
        row[columns[j] ?? `col${j + 1}`] = v; // v = { in, cm }
      });
      return row;
    });
    return {
      short_code: shortCode,
      product: d.name,
      columns,
      unit_note:
        'Each cell has { in, cm }. Manual measurement may vary 1-2 inches.',
      sizes,
      image: sc.image || null,
    };
  }

  /** Map partnerId → processing time (parse từ HTML của /decorations/filter). */
  async getProcessingByPartner(
    shortCode: string,
  ): Promise<Record<string, string | null>> {
    try {
      const data: any = await this.getCached(
        `/decorations/filter?shortCode=${encodeURIComponent(shortCode)}`,
      );
      const locs: any[] = data?.locations ?? [];
      const map: Record<string, string | null> = {};
      for (const l of locs) {
        const m = /Processing Time[\s\S]*?text-white[^>]*>([^<]+)</i.exec(
          l.value ?? '',
        );
        map[l.id] = m ? m[1].trim() : null;
      }
      return map;
    } catch {
      return {};
    }
  }

  /** GET có cache (catalog-api). */
  private async getCached(path: string): Promise<unknown> {
    const key = `catalogv1:${createHash('sha1').update(path).digest('hex').slice(0, 16)}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
    try {
      const res = await firstValueFrom(
        this.http.get(`${this.baseUrl}${path}`, { timeout: 15_000 }),
      );
      const data = (res.data as any)?.data ?? res.data;
      await this.redis.setEx(key, JSON.stringify(data), 1800);
      return data;
    } catch (err) {
      this.logger.error(
        `catalog-v1 error GET ${path}: ${(err as Error).message}`,
      );
      return {
        error: true,
        code: 'CATALOG_V1_ERROR',
        message: `Failed to fetch shipping/catalog v1 data: ${(err as Error).message}`,
      };
    }
  }
}
