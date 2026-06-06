import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Product } from './schemas/product.schema';
import { Variant } from './schemas/product-variant.schema';
import { ShippingRate } from './schemas/product-shipping.schema';

/**
 * Tên sản phẩm BurgerPrints có dạng "Type | Model" (vd "Unisex T-Shirt | Gildan 5000").
 * Dấu `|` làm VỠ cột markdown table khi LLM in ra → thay bằng "·".
 */
function cleanName(name: string): string {
  return (name ?? '').replace(/\s*\|\s*/g, ' · ').trim();
}

@Injectable()
export class BurgerPrintToolService {
  private readonly logger = new Logger(BurgerPrintToolService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Variant.name) private readonly variantModel: Model<Variant>,
    @InjectModel(ShippingRate.name) private readonly shippingModel: Model<ShippingRate>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('burgerprints.baseUrl') as string;
  }
  
  private get apiKey(): string {
    return this.config.get<string>('burgerprints.apiKey') as string;
  }

  private normalizeMarket(market?: string): string | null {
    if (!market) return null;
    const m = market.toLowerCase();
    if (/\b(us|usa|mỹ|my|hoa kỳ|united states|america)\b/.test(m)) return 'US';
    if (/\b(eu|europe|châu âu|chau au|european)\b/.test(m)) return 'EU';
    if (/\b(cn|china|trung quốc|trung quoc)\b/.test(m)) return 'CN';
    if (/\b(au|australia|úc|uc)\b/.test(m)) return 'AU';
    return market.toUpperCase();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: searchProducts
  // ──────────────────────────────────────────────────────────────────────
  async searchProducts(params: {
    category?: string;
    keyword?: string;
    market?: string;
    max_base_cost?: number;
    limit?: number;
  }): Promise<unknown> {
    const kw = (params.category ?? params.keyword ?? '').trim();
    const market = this.normalizeMarket(params.market);
    const maxCost =
      typeof params.max_base_cost === 'number' && params.max_base_cost > 0
        ? params.max_base_cost
        : null;
    const limit = Math.min(params.limit ?? 15, 25);

    const matchQuery: any = {};
    if (kw) {
      matchQuery.$text = { $search: kw };
    }
    if (market) {
      matchQuery.region = market;
    }
    // NOTE: do NOT pre-filter by dropshipPriceMin here. The authoritative price is
    // the cheapest *variant* base_cost (computed below); dropshipPriceMin can differ,
    // so a DB pre-filter would drop products whose real base_cost is within budget.

    const sortOpt: any = kw
      ? { score: { $meta: 'textScore' } }
      : { dropshipPriceMin: 1 };

    // Fetch extra candidates so the post-enrichment base_cost filter still leaves enough.
    const fetchN = maxCost != null ? limit * 4 : limit * 2;
    const products = await this.productModel
      .find(matchQuery, kw ? { score: { $meta: 'textScore' } } : undefined)
      .sort(sortOpt)
      .limit(fetchN)
      .lean();

    const enriched = await Promise.all(
      products.map(async (p) => {
        // Find cheapest variant for this product
        const cheapestVariant = await this.variantModel
          .findOne({ productShortCode: p.shortCode })
          .sort({ baseCost: 1 })
          .lean();

        return {
          short_code: p.shortCode,
          name: cleanName(p.name),
          market: p.region,
          base_cost: cheapestVariant ? cheapestVariant.baseCost : p.dropshipPriceMin,
          cheapest_factory: cheapestVariant ? cheapestVariant.partnerName : null,
          colors: p.countColors,
          printing: p.techniques?.join(', ') || null,
          processing_time: p.productionTime ? `${p.productionTime.min}-${p.productionTime.max} business days` : null,
          // Internal: text-relevance score (stripped before returning).
          _score: (p as any).score ?? 0,
        };
      }),
    );

    let result = enriched.filter((r) => r.base_cost != null);
    if (maxCost != null) {
      result = result.filter((r) => (r.base_cost as number) <= maxCost);
    }
    // Keyword/category search → relevance first, cheapest as tiebreaker (so a named
    // product is not buried under cheaper, less-relevant matches). Browse (no keyword)
    // → cheapest first.
    if (kw) {
      result.sort(
        (a, b) =>
          b._score - a._score ||
          (a.base_cost as number) - (b.base_cost as number),
      );
    } else {
      result.sort((a, b) => (a.base_cost as number) - (b.base_cost as number));
    }

    const products_out = result
      .slice(0, limit)
      .map(({ _score, ...rest }) => rest);

    return {
      query: {
        category: kw || null,
        market: market || null,
        max_base_cost: maxCost,
      },
      total_matched: result.length,
      qualified: result.length,
      note: 'base_cost = cheapest variant price (lowest-cost factory). Ranked by relevance when a keyword is given, else by price.',
      products: products_out,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: compareFactories
  // ──────────────────────────────────────────────────────────────────────
  async compareFactories(shortCode: string): Promise<unknown> {
    const product = await this.productModel.findOne({ shortCode }).lean();
    if (!product) {
      return { error: true, message: 'Product not found' };
    }

    const factoriesData = await this.variantModel.aggregate([
      { $match: { productShortCode: shortCode } },
      {
        $group: {
          _id: '$partnerName',
          partner_id: { $first: '$partnerId' },
          min_price: { $min: '$baseCost' },
          max_price: { $max: '$baseCost' },
          sku_count: { $sum: 1 },
        },
      },
      { $sort: { min_price: 1 } },
    ]);

    const factories = factoriesData.map((f) => {
      const matchedPartner = product.partners?.find(p => p.partner_id === f.partner_id);
      return {
        partner_name: f._id,
        partner_id: f.partner_id,
        min_price: f.min_price,
        max_price: f.max_price,
        sku_count: f.sku_count,
        processing_time: matchedPartner?.processingTime || null,
      };
    });

    return {
      short_code: product.shortCode,
      name: cleanName(product.name),
      market: product.region,
      printing: product.techniques?.join(', '),
      location: product.location || null,
      sizes: product.sizes?.map((s: any) => s.name) || [],
      colors_count: product.colors?.length || 0,
      colors_sample: (product.colors || []).slice(0, 12).map((c: any) => c.name),
      cheapest_factory: factories[0] ?? null,
      factories,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getProductVariants
  // ──────────────────────────────────────────────────────────────────────
  async getProductVariants(
    shortCode: string,
    filter: { color?: string; size?: string; factory?: string; limit?: number },
  ): Promise<unknown> {
    const product = await this.productModel.findOne({ shortCode }).lean();
    if (!product) {
      return { error: true, message: 'Product not found' };
    }

    const limit = Math.min(filter.limit ?? 30, 60);

    const matchQuery: any = { productShortCode: shortCode };
    if (filter.color) {
      matchQuery.color = { $regex: filter.color, $options: 'i' };
    }
    if (filter.size) {
      matchQuery.size = { $regex: `^${filter.size}$`, $options: 'i' };
    }
    if (filter.factory) {
      matchQuery.partnerName = { $regex: filter.factory, $options: 'i' };
    }

    const variants = await this.variantModel.find(matchQuery).limit(limit).lean();
    
    const matched = variants.map((v) => ({
      sku: v.sku,
      catalog_sku: `${product.shortCode}-${v.color}-${v.size}`,
      color: v.color,
      size: v.size,
      price: v.baseCost,
      second_price: v.secondSidePrice,
      partner_name: v.partnerName,
      in_stock: v.inStock ?? true,
    }));

    return {
      short_code: product.shortCode,
      name: cleanName(product.name),
      total_matched: matched.length,
      out_of_stock_count: matched.filter(m => !m.in_stock).length,
      note: 'Dùng catalog_sku (KHÔNG phải sku) khi create_order.',
      variants: matched,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getShipping
  // ──────────────────────────────────────────────────────────────────────
  async getShipping(
    shortCode: string,
    partnerId: string,
    country?: string,
  ): Promise<unknown> {
    const query: any = { productShortCode: shortCode, partnerId: partnerId };
    if (country) {
      query.$or = [
        { countryCode: { $regex: `^${country}$`, $options: 'i' } },
        { countryName: { $regex: country, $options: 'i' } },
      ];
    }

    const rates = await this.shippingModel.find(query).lean();
    
    if (!rates.length) {
      return { error: true, message: 'No shipping data found' };
    }

    const shipping = rates.map(r => ({
      country: r.countryName,
      method: r.method,
      time: r.daysRaw || (r.days ? `${r.days.min}-${r.days.max} business days` : ''),
      carrier: r.carriers?.join(', ') || '',
      first_item_price: r.firstItemPrice,
      additional_item_price: r.additionalItemPrice,
    }));

    return {
      short_code: shortCode,
      partner_id: partnerId,
      total_countries: rates.length,
      shipping,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getSizeChart
  // ──────────────────────────────────────────────────────────────────────
  async getSizeChart(shortCode: string): Promise<unknown> {
    const p = await this.productModel.findOne({ shortCode }).select('name sizeChart').lean();
    if (!p) return { error: true, message: `Product ${shortCode} not found` };
    if (!p.sizeChart) return { short_code: shortCode, message: 'This product has no size chart.' };
    
    let sc: any;
    try {
      sc = typeof p.sizeChart === 'string' ? JSON.parse(p.sizeChart) : p.sizeChart;
    } catch {
      return { short_code: shortCode, message: 'Size chart has an invalid format.' };
    }
    const columns: string[] = sc.column ?? [];
    const sizes = (sc.size ?? []).map((s: string, i: number) => {
      const row: Record<string, unknown> = { size: s };
      (sc.data?.[i] ?? []).forEach((v: any, j: number) => {
        row[columns[j] ?? `col${j + 1}`] = v;
      });
      return row;
    });
    return {
      short_code: shortCode,
      product: p.name,
      columns,
      unit_note: 'Each cell has { in, cm }. Manual measurement may vary 1-2 inches.',
      sizes,
      image: sc.image || null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getProductDetail_card
  // ──────────────────────────────────────────────────────────────────────
  async getProductDetail_card(shortCode: string): Promise<unknown> {
    const p = await this.productModel.findOne({ shortCode }).lean();
    if (!p) return null;
    
    return {
      short_code: p.shortCode,
      name: cleanName(p.name),
      market: p.region,
      description: p.desc || null,
      base_cost: { min: p.dropshipPriceMin, max: p.dropshipPriceMax },
      currency: p.currency || 'USD',
      print_sides: p.printAreas || [],
      processing_time: p.productionTime ? `${p.productionTime.min}-${p.productionTime.max}` : null,
      production_time: p.productionTime ? `${p.productionTime.min}-${p.productionTime.max}` : null,
      shipping_summary: (p.shippingTimeUs || p.shippingTimeWW) ? {
        carriers: null,
        time_us: p.shippingTimeUs ? `${p.shippingTimeUs.min}-${p.shippingTimeUs.max}` : null,
        time_worldwide: p.shippingTimeWW ? `${p.shippingTimeWW.min}-${p.shippingTimeWW.max}` : null,
      } : null,
      mockup_image: p.mockup || null,
      counts: {
        colors: p.countColors || (p.colors?.length ?? 0),
        sizes: p.sizes?.length ?? 0,
        factories: p.partners?.length ?? 0,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getProductColors
  // ──────────────────────────────────────────────────────────────────────
  async getProductColors(shortCode: string): Promise<unknown> {
    const p = await this.productModel.findOne({ shortCode }).select('colors').lean();
    if (!p) return { error: true, message: `Product ${shortCode} not found` };
    return {
      short_code: shortCode,
      total_colors: p.colors?.length || 0,
      colors: p.colors || [],
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getDecorations
  // ──────────────────────────────────────────────────────────────────────
  async getDecorations(shortCode: string): Promise<unknown> {
    const p = await this.productModel.findOne({ shortCode }).select('decorations').lean();
    if (!p) return { error: true, message: `Product ${shortCode} not found` };
    const decorations = (p.decorations ?? []).map((dec: any) => {
      const g = dec.designGuideline || {};
      return {
        technique: dec.name || dec.technique,
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

  // ──────────────────────────────────────────────────────────────────────
  // Tool: getRelatedProducts
  // ──────────────────────────────────────────────────────────────────────
  async getRelatedProducts(shortCode: string): Promise<unknown> {
    const p = await this.productModel.findOne({ shortCode }).select('relatedProducts').lean();
    if (!p) return { error: true, message: `Product ${shortCode} not found` };
    return { 
      short_code: shortCode, 
      total: p.relatedProducts?.length || 0, 
      related: p.relatedProducts || [] 
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: createOrder
  // ──────────────────────────────────────────────────────────────────────
  async createOrder(payload: {
    shipping: {
      name: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
      country: string;
      email?: string;
      phone?: string;
    };
    items: Array<{
      catalog_sku: string;
      quantity: number;
      design_url_front?: string;
      mockup_url_front?: string;
    }>;
    reference_order_id?: string;
    sandbox?: boolean;
  }): Promise<unknown> {
    const s = payload.shipping;
    const body: Record<string, unknown> = {
      shipping_name: s.name,
      shipping_address1: s.address1,
      shipping_address2: s.address2 ?? '',
      shipping_city: s.city,
      shipping_state: s.state,
      shipping_zip: s.zip,
      shipping_country: s.country,
      shipping_email: s.email ?? '',
      shipping_phone: s.phone ?? '',
      reference_order_id: payload.reference_order_id ?? `agent-${Date.now()}`,
      items: payload.items.map((it) => ({
        catalog_sku: it.catalog_sku,
        quantity: it.quantity,
        ...(it.design_url_front
          ? { design_url_front: it.design_url_front }
          : {}),
        ...(it.mockup_url_front
          ? { mockup_url_front: it.mockup_url_front }
          : {}),
      })),
      sandbox: payload.sandbox ?? true,
    };

    try {
      const res = await firstValueFrom(
        this.http.post(`${this.baseUrl}/order`, body, {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
        }),
      );
      return { sandbox: body.sandbox, result: res.data };
    } catch (err) {
      const msg = (err as any)?.response?.data ?? (err as Error).message;
      this.logger.error(`Tạo đơn lỗi: ${JSON.stringify(msg)}`);
      return {
        error: true,
        code: 'CREATE_ORDER_ERROR',
        message: 'Không tạo được đơn',
        detail: msg,
      };
    }
  }
}
