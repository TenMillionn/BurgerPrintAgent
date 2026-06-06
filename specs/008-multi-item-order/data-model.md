# Data Model & Interfaces

## Frontend State Model

### `OrderContext` State
```typescript
interface OrderState {
  items: OrderItem[];
  shipping: ShippingDto;
  shipping_method?: string;
  production_service?: string;
  additional_service?: string;
  reference_order_id?: string;
  sandbox?: boolean;
}

interface OrderItem {
  id: string; // internal UUID for tracking in UI
  product_id?: string;
  catalog_sku?: string;
  quantity: number;
  
  // UI-specific selections (not sent to backend directly but used to derive catalog_sku)
  selectedProductShortCode?: string;
  selectedPartnerId?: string;
  selectedColor?: string;
  selectedSize?: string;

  // Designs
  design_url_front?: string;
  design_url_back?: string;
  design_url_sleeve?: string;
  mockup_url_front?: string;
  mockup_url_back?: string;
  mockup_url_sleeve?: string;
  
  reference_item_id?: string;
}
```

## Backend API Contracts

### 1. `GET /orders/products`
Fetch a list of available products.
- **Query Params**: `keyword`, `market`
- **Response**: Array of enriched products from `BurgerPrintToolService.searchProducts()`

### 2. `GET /orders/products/:shortCode/factories`
Fetch available fulfillment partners for a specific product.
- **Response**: Product details and array of `factories` from `BurgerPrintToolService.compareFactories()`

### 3. `GET /orders/products/:shortCode/variants`
Fetch variants (sizes, colors) supported by a specific factory for a product.
- **Query Params**: `factory`
- **Response**: Array of variants from `BurgerPrintToolService.getProductVariants()`

### 4. `GET /orders/products/:shortCode/detail`
Fetch detailed product configuration (e.g. print areas).
- **Response**: Details from `BurgerPrintToolService.getProductDetail_card()`
