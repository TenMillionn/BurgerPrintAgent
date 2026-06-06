# Data Model: BurgerPrint Catalog API Data Sync

## Multiple Collections Architecture

To handle the 16MB document limit and ensure scalable, independent updates, the catalog data is split into three main collections: `Products`, `ProductVariants`, and `ProductShippings`.

---

## 1. `Product` Collection

Stores the core product catalog information, categories, decorations, and factory support lists.

**Primary Key / Unique Identifier**: `shortCode`

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `shortCode` | String | **Primary Key** (e.g., "EUG2400"). Strictly unique. |
| `externalId` | String | Original ID from the API (`id` field). |
| `aliasName` | String | URL-friendly alias. |
| `name`, `desc` | String | Product display name and description. |
| `htmlDesc` | String | Raw HTML description from detail API. |
| `brand`, `categories` | String/Array | Extracted from `catalogObjects`. |
| `options` | Array of Objects | Attributes like available colors, sizes with their IDs. |
| `printable` | Array of Objects | Printable areas (front, back, sleeve). |
| `media` | Array of Strings | Product image URLs. |
| `sizeChart` | Array/String | Sizing dimensions. |
| `techniques`, `printAreas`| Array of Strings | Extracted from `decorations` JSON. |
| `partnerSupport` | Array of Objects | Factory support summary (partnerId, supportedColors, etc.). |
| `detailFetched` | Boolean | Flag indicating if detail job completed successfully. |
| `syncedAt` | Date | Last successful sync timestamp. |

---

## 2. `ProductVariant` Collection

Stores the specific size/color combinations, SKUs, and per-variant pricing.

**Primary Key / Unique Identifier**: `baseSkuId` (mapped from `baseSku.id` in the API)

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `baseSkuId` | String | **Primary Key** (from API's `baseSku.id`). Strictly unique. |
| `productShortCode` | String | Foreign key linking to `Product.shortCode`. |
| `sku` | String | The actual SKU string. |
| `colorId`, `sizeId` | String | References to the options defined in `Product`. |
| `baseCost` | Number | Base printing cost. |
| `secondSidePrice` | Number | Cost for printing a second side. |
| `shippingCostUs` | Number | First item shipping cost to US. |
| `shippingAddingUs` | Number | Additional item shipping cost to US. |
| `dropshipPrice` | Number | Retail/Dropship price. |
| `syncedAt` | Date | Last successful sync timestamp. |

**Indexes**: 
- `baseSkuId` (Unique)
- `productShortCode` (For quick lookup of all variants for a product)

---

## 3. `ProductShipping` Collection

Stores the specific shipping rates for a given product and partner combination across different zones/countries.

**Primary Key / Unique Identifier**: Composite of `productShortCode` + `partnerId` + `countryCode` (or a hash of them).

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `productShortCode` | String | Foreign key linking to `Product.shortCode`. |
| `partnerId` | String | Foreign key linking to the fulfillment partner. |
| `countryCode` | String | Destination country/zone. |
| `firstItemCost` | Number | Shipping cost for the first item. |
| `additionalItemCost`| Number | Shipping cost for additional items. |
| `deliveryTimeMin` | Number | Minimum estimated delivery days. |
| `deliveryTimeMax` | Number | Maximum estimated delivery days. |
| `carrier` | String | Shipping provider (e.g., USPS, DHL). |
| `syncedAt` | Date | Last successful sync timestamp. |

**Indexes**:
- Compound Index: `{ productShortCode: 1, partnerId: 1, countryCode: 1 }` (Unique)
- `productShortCode` (For looking up all shipping options for a product)
