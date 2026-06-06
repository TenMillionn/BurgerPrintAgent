export type CreateOrderPayload = {
  shipping: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country: string;
    email?: string;
    phone?: string;
  };
  shipping_method?: 'economy' | 'standard' | 'express' | 'priority express';
  production_service?: 'Priority';
  additional_service?: 'ProActive Tracking';
  callback_url?: string;
  shipping_label?: string;
  sandbox?: boolean;
  fulfillment_partner?: string;
  reference_order_id?: string;
  items: Array<{
    catalog_sku?: string;
    product_id?: string;
    variant_id?: string;
    quantity: number;
    design_url_front?: string;
    design_url_back?: string;
    design_url_sleeve?: string;
    mockup_url_front?: string;
    mockup_url_back?: string;
    mockup_url_sleeve?: string;
    reference_item_id?: string;
  }>;
};
