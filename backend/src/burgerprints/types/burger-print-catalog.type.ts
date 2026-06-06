/**
 * BurgerPrints Catalog v2 — RAW API response types
 * Host: catalog-api.burgerprints.com/api/v1
 *
 * LƯU Ý: đây là type "raw" đúng như API trả về.
 *  - Giá / số liệu phần lớn là `string` ("14", "4.99", "14.0") -> parseFloat khi normalize.
 *  - Một số field là JSON-string (`decorations`, `sizeChart`) -> JSON.parse (xem *Parsed types).
 *  - `value` của partner là HTML blob (string) -> cần parser riêng.
 *  - Nhiều field nullable.
 */

/* =========================================================================
 * 0. Envelope chung
 * ========================================================================= */
export interface BpApiResponse<T> {
  code: number;      // 200
  message: string;   // "success"
  data: T;
}

/* =========================================================================
 * 1. Sub-types dùng chung
 * ========================================================================= */

export interface BpCatalogObject {
  catalogId: string;
  catalogName: string;   // "Amazon" | "Express" | "T-shirts" | "Bella+Canvas" | "EU" ...
  description: string;
  catalogType?: string;
}

/** Size/màu ở cấp PRODUCT (position là number) */
export interface BpSizeOption {
  id: string;
  name: string;          // "S" | "M" | "2XL" ...
  position: number;
}
export interface BpColorOption {
  id: string;
  name: string;          // "Black"
  value: string;         // hex "#25282A"
  swag: string | null;
  position: number;
}

/** Màu ở cấp PARTNER (position là STRING — khác product) */
export interface BpPartnerColor {
  id: string;
  name: string;
  value: string;         // hex
  swag: string | null;
  position: string;      // ⚠️ string ở đây
}

export interface BpProductService {
  method: string;        // "standard"
  value: string;         // mô tả
}

/**
 * Partner / fulfillment location.
 * Xuất hiện ở: DETAIL.locations[] và DECORATIONS/filter -> data.locations[].
 * `value` là HTML blob chứa: Ideal for, Early tracking, Processing time,
 * Shipping method/carriers, Quality, Error rate, Printing method.
 */
export interface BpPartnerLocation {
  id: string;            // = partnerId (khóa nối tới shipping/variants.location)
  name: string;          // "Rocky" | "Hatta"
  value: string;         // HTML blob -> cần parse
  icon: string;
  position: string;      // "9" | "37"
  colors: BpPartnerColor[];
  flag: string | null;
  productServices: BpProductService[];
}

/* =========================================================================
 * 2. LIST — GET /catalogsV2/search?pageSize=&pageIndex=
 *    (cũng là shape của DETAIL.baseInterested[])
 * ========================================================================= */
export interface BpListProduct {
  searchKeywords: string | null;
  id: string;
  shortCode: string;
  name: string;
  mockup: string;
  resolutionDefault: string;
  stretchableDesign: '0' | '1' | null;
  genMockupSupport: '0' | '1';
  catalogObjects: BpCatalogObject[] | null;
  displayName: string;
  baseDesignFormat: string | null;
  catalogPosition: number | null;
  dropshipPriceMin: number;          // number ở list
  dropshipPriceMax: number;
  revenue: number | null;            // popularity
  isNew: '0' | '1' | null;
  createdDate: [number, number, number]; // [y, m(1-based), d]
  addressCountry: string | null;
  personSuggest: unknown | null;
  locations: string;                 // CSV tên xưởng: "Rocky,Hatta"
  sizesList: string;                 // CSV: "S,M,L,XL,2XL"
  countColors: string;               // "131"
  productionTime: string | null;     // "1-3"
  sizes: BpSizeOption[];
  colors: BpColorOption[];
  decorations: string;               // JSON string -> BpDecoration[]
  aliasName: string;
  desc?: string;
}

export interface BpPageableSort {
  sorted: boolean;
  unsorted: boolean;
  empty: boolean;
}

export interface BpPageable {
  sort: BpPageableSort;
  pageNumber: number;
  pageSize: number;
  offset: number;
  paged: boolean;
  unpaged: boolean;
}

export interface BpListResponseData<T> {
  content: T[];
  pageable: BpPageable;
  last: boolean;
  totalElements: number;
  totalPages: number;
  sort: BpPageableSort;
  first: boolean;
  number: number;
  numberOfElements: number;
  size: number;
  empty: boolean;
}

export type BpListResponse = BpApiResponse<BpListResponseData<BpListProduct>>;

/* =========================================================================
 * 3. DETAIL — GET /catalogsV2/alias/:alias   (SUPERSET)
 * ========================================================================= */

export interface BpPrintable {
  canvasHeight: string;
  canvasWidth: string;
  imgUrl: string | null;
  printableHeight: string;
  printableLeft: string;
  printableTop: string;
  printableWidth: string;
  type: string;          // "front" | "back"
  unit: string;          // "pixels"
}

export interface BpMedia {
  id: string;
  url: string;
  type: string;          // "image"
  shortCode: string;
}

/** Giá trị trong options[] (color có `value`, size không) */
export interface BpOptionValue {
  id: string;
  name: string;
  value?: string;        // hex (chỉ color)
  swag: string | null;
  position: number;
}
export interface BpOption {
  name: 'color' | 'size';
  values: BpOptionValue[];
}

/** baseSku[] = VARIANT × XƯỞNG (bảng giá xương sống) */
export interface BpBaseSku {
  id: string;
  shortCode: string;
  sku: string;                 // "EUG2400-Black-S"
  sizeId: string;
  sizeName: string;
  colorId: string;
  colorName: string;
  colorSwag: string | null;
  baseCost: string;            // "14" | "16" (⚠️ đổi theo size)
  secondSidePrice: string;     // "5" | "4.8" — phí mặt in thứ 2
  defaultProfit: string;       // "39.95" — gợi ý (xác minh ngữ nghĩa)
  sizePosition: number;
  location: string;            // = partnerId (KHÓA NỐI)
  locationPosition: number;
  locationName: string;        // "Rocky" | "Hatta"
  locationIcon: string;
  colorPosition: number;
  shippingCostUs: string;      // ship US item đầu
  shippingAddingUs: string;    // ship US item thêm
  shippingCostWW: string | null;
  shippingAddingWW: string | null;
}

export interface BpProductShipping {
  shippingLines: string;       // "Spring"
  shippingTimeUs: string;      // "3-9"
  shippingTimeWw: string;      // "7-15"
}

export interface BpProductDetail {
  shortCode: string;
  name: string;
  displayName: string;
  desc: string;
  currency: string;            // "USD"
  designGroup: string;         // "shirt"
  editSizePrice: number;
  fullFillment: number;
  strPrintable: string | null;
  printable: BpPrintable[];
  dimension: { dimensions: { width: number | null; height: number | null } };
  strDimension: string | null;
  position: string;
  designType: string | null;
  state: string;               // "approved"
  media: BpMedia[];
  resolutionRequire: string;   // pipe-separated
  catalogName: string | null;
  catalogId: string | null;
  htmlDesc: string;            // chứa region + technique
  designTemplate: string | null;
  sizeChart: string;           // JSON string -> BpSizeChart
  titleSuffix: string;         // "EU"
  baseCost: string;            // top-level "14"
  sizes: null;                 // luôn null ở detail (dùng options)
  colors: null;
  options: BpOption[];
  baseSku: BpBaseSku[];
  processingTime: string;      // "2-4 business days"
  shippingLines: string | null;
  shippingTimeUS: string | null;
  shippingTimeWW: string | null;
  shipping: BpProductShipping | null;
  baseInterested: BpListProduct[];
  baseGroupId: string | null;
  shippingCostUs: string | null;
  shippingCostWW: string | null;
  shippingAddingUs: string | null;
  shippingAddingWW: string | null;
  locationDB: unknown | null;
  metadataDB: unknown | null;
  locations: BpPartnerLocation[];   // các xưởng (Rocky, Hatta) + HTML blob
  decorations: BpDecoration[] | null;
}

export type BpDetailResponse = BpApiResponse<BpProductDetail>;

/* =========================================================================
 * 4. DECORATIONS / FILTER — GET /catalogsV2/decorations/filter?decoration=&shortCode=
 *    (xưởng in được kỹ thuật đó cho sản phẩm)
 * ========================================================================= */
export interface BpDecorationsFilterData {
  locations: BpPartnerLocation[];
}
export type BpDecorationsFilterResponse = BpApiResponse<BpDecorationsFilterData>;

/* =========================================================================
 * 5. LOCATIONS (shipping) — GET /catalogsV2/locations?shortCode=&partnerId=
 *    (ma trận ship theo quốc gia cho cặp product × partner)
 * ========================================================================= */
export interface BpShippingDetail {
  method: string;              // "standard"
  name: string;                // "Standard"
  description: string;         // "5-10 business days"
  carriers: string;            // "DHL"
  firstItemPrice: string;      // "9.0"
  additionalItemPrice: string; // "3.59"
  position: number;
}
export interface BpCountryShipping {
  countryCode: string;         // "DE"
  countryName: string;
  flag: string;
  details: BpShippingDetail[] | null;  // null = KHÔNG ship tới nước này
}
export type BpLocationsResponse = BpApiResponse<BpCountryShipping[]>;

/* =========================================================================
 * 6. PARSED types cho các field JSON-string (sau khi JSON.parse)
 * ========================================================================= */

/** JSON.parse(product.decorations) */
export interface BpDecorationArea {
  decorationKey: string;       // "Front" | "Back" | "Left Sleeve / Right Sleeve"
  decorationArea: string;      // "4200x4800 at 300 DPI (14x16 in)"
  hoop: string;
  templateUrl: string;
}
export interface BpDecorationGuidelineItem {
  img: string;
  title: string;
  content: string;
}
export interface BpDecoration {
  name: string;                // "DTG Printing" | "DTF Printing" | "Digital Printing"
  value: BpDecorationArea[];
  designGuideline: {
    fileFormat: BpDecorationGuidelineItem;
    colorProfile: BpDecorationGuidelineItem;
    warning: BpDecorationGuidelineItem;
  };
}

/** JSON.parse(detail.sizeChart) */
export interface BpSizeChart {
  image: string;
  size: string[];                       // ["S","M","L","XL","2XL"]
  data: { in: string; cm: string }[][]; // [size][measurement]
  name: string;
  column: string[];                     // ["Length","Bust","Sleeve"]
  type: string;                         // "tshirt-2d"
  image2: string;
}

/**
 * Kết quả parse HTML blob (partner.value) — KHÔNG có sẵn, bạn tự parse.
 * Đây là type đích sau khi bóc tách bằng cheerio/regex.
 */
export interface BpParsedPartnerInfo {
  idealForPlatforms: string[];   // ["AMZ","Etsy","eBay","Store owner"]
  earlyTracking: boolean | null; // "Yes"/"No"
  processingTime: { min: number; max: number } | null; // "1-5 Business days"
  carriers: string[];            // ["DPD","DHL","Asendia"]
  quality: string | null;        // "Good"
  errorRate: number | null;      // "1%" -> 1
  printingMethod: string | null; // "DTG Printing"
}