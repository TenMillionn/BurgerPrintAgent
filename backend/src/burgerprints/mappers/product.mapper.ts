import {
  BpListProduct,
  BpCatalogObject,
} from '../types/burger-print-catalog.type';
import { SizeOpt, ColorOpt, Range } from '../schemas/product.schema';

export class ProductMapper {
  static fromApiList(item: BpListProduct): any {
    const categories: string[] = [];
    const sellingPlatforms: string[] = [];
    const shippingTiers: string[] = [];
    const collections: string[] = [];
    const brandContainer = { value: '' };

    if (Array.isArray(item.catalogObjects)) {
      item.catalogObjects.forEach((obj) => {
        ProductMapper.classifyCatalogObject(
          obj,
          categories,
          sellingPlatforms,
          shippingTiers,
          collections,
          brandContainer,
        );
      });
    }

    const { techniques, printAreas } = ProductMapper.parseDecorations(
      item.decorations,
    );

    const productionTime = ProductMapper.parseRange(item.productionTime);
    const region = ProductMapper.determineRegion(item.shortCode);
    const productCategory = ProductMapper.determineProductCategory(categories);
    const createdDate = ProductMapper.parseCreatedDate(item.createdDate);
    const searchText = ProductMapper.generateSearchText(
      item.name,
      item.aliasName,
      item.desc,
      item.searchKeywords,
    );

    return {
      _id: item.id,
      externalId: item.id,
      shortCode: item.shortCode,
      aliasName: item.aliasName,
      name: item.name,
      displayName: item.displayName,
      mockup: item.mockup,
      region,
      productCategory,
      categories,
      sellingPlatforms,
      shippingTiers,
      collections,
      brand: brandContainer.value,
      techniques,
      printAreas,
      revenue: item.revenue || 0,
      dropshipPriceMin: item.dropshipPriceMin,
      dropshipPriceMax: item.dropshipPriceMax,
      productionTime,
      countColors: parseInt(item.countColors, 10) || 0,
      isNewProduct: item.isNew === '1',
      createdDate,
      sizes: (item.sizes || []).map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
      })),
      colors: (item.colors || []).map((c) => ({
        id: c.id,
        name: c.name,
        value: c.value,
        position: c.position,
      })),
      searchText,
      syncedAt: new Date(),
    };
  }

  static fromApiDetail(data: any): any {
    const region = ProductMapper.determineRegion(
      data.shortCode,
      data.titleSuffix,
      data.htmlDesc,
    );
    const shippingTimeUs = ProductMapper.parseRange(
      data.shipping?.shippingTimeUs || data.shippingTimeUS,
    );
    const shippingTimeWW = ProductMapper.parseRange(
      data.shipping?.shippingTimeWw || data.shippingTimeWW,
    );

    const parsedHtml = ProductMapper.parseHtmlDesc(data.htmlDesc || '');

    return {
      currency: data.currency,
      designGroup: data.designGroup,
      region,
      location: parsedHtml.location,
      htmlDesc: data.htmlDesc,
      desc: data.desc,
      material: parsedHtml.material,
      shippingTimeUs,
      shippingTimeWW,
      sizeChart:
        typeof data.sizeChart === 'string'
          ? data.sizeChart
          : JSON.stringify(data.sizeChart || {}),
      decorations: data.decorations || [],
      relatedProducts: (data.baseInterested || []).map((b: any) => ({
        shortCode: b.shortCode,
        name: b.name,
      })),
      resolutionRequire: data.resolutionRequire || '',
      printable: data.printable || [],
      detailFetched: true,
      syncedAt: new Date(),
    };
  }

  static determineRegion(
    shortCode: string,
    titleSuffix?: string,
    htmlDesc?: string,
  ): string {
    if (shortCode?.toUpperCase().startsWith('US')) return 'US';
    if (shortCode?.toUpperCase().startsWith('EU')) return 'EU';
    if (titleSuffix?.toUpperCase() === 'EU') return 'EU';

    const descUpper = (htmlDesc || '').toUpperCase();
    if (descUpper.includes('EU ') || descUpper.includes('EUROPE')) return 'EU';
    if (descUpper.includes('US ') || descUpper.includes('UNITED STATES'))
      return 'US';

    return 'US'; // Fallback default
  }

  static determineProductCategory(
    categories: string[],
    designGroup?: string,
  ): string {
    const allText = [...(categories || []), designGroup || ''].map((c) =>
      c.toLowerCase(),
    );
    if (
      allText.some(
        (t) =>
          t.includes('shirt') ||
          t.includes('hoodie') ||
          t.includes('apparel') ||
          t.includes('clothing') ||
          t.includes('tank top') ||
          t.includes('sweatshirt'),
      )
    ) {
      return 'apparel';
    }
    if (
      allText.some(
        (t) =>
          t.includes('mug') ||
          t.includes('tumbler') ||
          t.includes('home') ||
          t.includes('kitchen') ||
          t.includes('decor') ||
          t.includes('canvas'),
      )
    ) {
      return 'home';
    }
    return 'accessories'; // default fallback
  }

  static parseHtmlDesc(html: string): {
    material: string | null;
    printing: string | null;
    location: string | null;
    processingTime: string | null;
  } {
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const processingTime =
      /Processing Time[:\s]*([^<.]+?)(?:\.|<|Shipping|$)/i
        .exec(text)?.[1]
        ?.trim()
        ?.slice(0, 50) ?? null;
    const printing =
      /(?:Printing tech\w*|Technique)[:\s]*([^.<]+?)(?:\.|Manufactured|Location|$)/i.exec(
        text,
      )?.[1] ??
      (/(DTG|DTF|Dye-sublimation|Sublimation)/i.exec(text)?.[0] || null);
    const location =
      /Manufactured in ([A-Za-z ]+?)(?:\.|,|<|$)/i.exec(text)?.[1]?.trim() ??
      /Location[:\s]*([A-Za-z ]+?)(?:\.|,|<|$)/i.exec(text)?.[1]?.trim() ??
      null;
    const material =
      /(\d+%[^.]*?(?:cotton|polyester|spandex)[^.]*)/i
        .exec(text)?.[1]
        ?.trim() ?? null;
    return {
      material: material ? material.slice(0, 80) : null,
      printing: printing ? printing.trim().slice(0, 40) : null,
      location,
      processingTime,
    };
  }

  static classifyCatalogObject(
    obj: BpCatalogObject,
    categories: string[],
    sellingPlatforms: string[],
    shippingTiers: string[],
    collections: string[],
    brand: { value: string },
  ) {
    const name = obj.catalogName;
    const desc = obj.description;

    if (obj.catalogType) {
      if (obj.catalogType === 'category') categories.push(name);
      else if (obj.catalogType === 'sellingPlatform')
        sellingPlatforms.push(name);
      else if (obj.catalogType === 'shippingTier') shippingTiers.push(name);
      else if (obj.catalogType === 'collection') collections.push(name);
      else if (obj.catalogType === 'brand') brand.value = name;
      return;
    }

    const lowerName = name.toLowerCase();

    if (
      lowerName.includes('amazon') ||
      lowerName.includes('etsy') ||
      lowerName.includes('shopify') ||
      lowerName.includes('walmart') ||
      lowerName.includes('tiktok') ||
      lowerName.includes('selling platform') ||
      lowerName.includes('optimized')
    ) {
      sellingPlatforms.push(name);
    } else if (
      lowerName.includes('express') ||
      lowerName.includes('standard') ||
      lowerName.includes('economy') ||
      lowerName.includes('shipping')
    ) {
      shippingTiers.push(name);
    } else if (
      lowerName.includes('best seller') ||
      lowerName.includes('favorite') ||
      lowerName.includes('seasonal')
    ) {
      collections.push(name);
    } else if (
      lowerName.includes('comfort colors') ||
      lowerName.includes('gildan') ||
      lowerName.includes('bella+canvas') ||
      lowerName.includes('champion') ||
      lowerName.includes('next level') ||
      lowerName.includes('port & company')
    ) {
      brand.value = name;
    } else {
      categories.push(name);
    }
  }

  static parseDecorations(decorationsStr?: string | null): {
    techniques: string[];
    printAreas: string[];
  } {
    const techniques: string[] = [];
    const printAreas: string[] = [];
    if (decorationsStr) {
      try {
        const decObj = JSON.parse(decorationsStr);
        if (Array.isArray(decObj)) {
          decObj.forEach((dec: any) => {
            const technique = dec.technique || dec.name;
            if (technique) techniques.push(technique);
            const keys = dec.keys || dec.value;
            if (keys && Array.isArray(keys)) {
              keys.forEach((k: any) => {
                const label = k.label || k.key || k.decorationKey;
                if (label) printAreas.push(label);
              });
            }
          });
        }
      } catch {
        // ignore parsing error
      }
    }
    return {
      techniques: [...new Set(techniques)],
      printAreas: [...new Set(printAreas)],
    };
  }

  static parseRange(rangeStr?: string | null): Range | null {
    if (!rangeStr) return null;
    const parts = rangeStr.split('-');
    if (parts.length === 2) {
      const min = parseInt(parts[0], 10);
      const max = parseInt(parts[1], 10);
      if (!isNaN(min) && !isNaN(max)) {
        return { min, max };
      }
    }
    const single = parseInt(rangeStr, 10);
    if (!isNaN(single)) {
      return { min: single, max: single };
    }
    return null;
  }

  static parseCreatedDate(
    createdDate: [number, number, number] | any,
  ): Date | null {
    if (Array.isArray(createdDate) && createdDate.length >= 3) {
      return new Date(createdDate[0], createdDate[1] - 1, createdDate[2]);
    }
    return null;
  }

  static generateSearchText(
    name: string,
    aliasName: string,
    desc?: string,
    searchKeywords?: string | null,
  ): string {
    const parts = [
      name || '',
      aliasName || '',
      desc || '',
      searchKeywords || '',
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  static fromApiVariant(
    sku: any,
    shortCode: string,
    productName: string,
    options?: any[],
  ): any {
    const colorHex = ProductMapper.findColorHex(sku.colorId, options);
    return {
      sku: sku.sku,
      productShortCode: shortCode,
      productName,
      sizeId: sku.sizeId,
      size: sku.sizeName,
      colorId: sku.colorId,
      color: sku.colorName,
      colorHex,
      baseCost: parseFloat(sku.baseCost) || 0,
      secondSidePrice: parseFloat(sku.secondSidePrice) || 0,
      defaultProfit: parseFloat(sku.defaultProfit) || 0,
      partnerId: sku.location,
      partnerName: sku.locationName,
      shippingCostUs: parseFloat(sku.shippingCostUs) || 0,
      shippingAddingUs: parseFloat(sku.shippingAddingUs) || 0,
      shippingCostWW: parseFloat(sku.shippingCostWW) || 0,
      shippingAddingWW: parseFloat(sku.shippingAddingWW) || 0,
      syncedAt: new Date(),
    };
  }

  static findColorHex(colorId: string, options?: any[]): string {
    if (Array.isArray(options)) {
      const colorOption = options.find((opt: any) => opt.name === 'color');
      if (colorOption && Array.isArray(colorOption.values)) {
        const colorVal = colorOption.values.find(
          (val: any) => val.id === colorId,
        );
        if (colorVal && colorVal.value) {
          return colorVal.value;
        }
      }
    }
    return '';
  }

  static fromApiShipping(
    detail: any,
    shortCode: string,
    partnerId: string,
    country: any,
  ): any {
    const daysRaw = detail.description || '';
    const days = ProductMapper.parseDaysRange(daysRaw);
    const carriers =
      typeof detail.carriers === 'string'
        ? detail.carriers
            .split(',')
            .map((c: string) => c.trim())
            .filter(Boolean)
        : [];

    return {
      productShortCode: shortCode,
      partnerId,
      countryCode: country.countryCode || country.code,
      countryName: country.countryName,
      method: detail.method,
      methodName: detail.name,
      days,
      daysRaw,
      carriers,
      firstItemPrice: parseFloat(detail.firstItemPrice) || 0,
      additionalItemPrice: parseFloat(detail.additionalItemPrice) || 0,
      syncedAt: new Date(),
    };
  }

  static parseDaysRange(daysRaw: string): Range | null {
    if (!daysRaw) return null;
    const procMatch = daysRaw.match(/(\d+)\s*-\s*(\d+)/);
    if (procMatch) {
      return {
        min: parseInt(procMatch[1], 10),
        max: parseInt(procMatch[2], 10),
      };
    }
    const singleMatch = daysRaw.match(/(\d+)/);
    if (singleMatch) {
      const val = parseInt(singleMatch[1], 10);
      return { min: val, max: val };
    }
    return null;
  }
}
