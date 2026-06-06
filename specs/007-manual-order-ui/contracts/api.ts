export interface CostCalculationRequest {
  productId: string;
  country: string;
  state: string;
}

export interface ShippingOption {
  service: string;
  cost: number;
  estimatedDays: string;
}

export interface CostCalculationResponse {
  productionFee: number;
  shippingOptions: ShippingOption[];
}

export interface CreateManualOrderRequest {
  productId: string;
  color: string;
  size: string;
  // Note: For file uploads, FormData might be used instead of JSON, 
  // or a pre-signed URL upload approach could be taken.
  // designFileUrl?: string; 
  shippingAddress: {
    fullName: string;
    email: string;
    phone: string;
    country: string;
    state: string;
    city: string;
    street: string;
    zipcode: string;
  };
  shippingService: string;
}

export interface CreateManualOrderResponse {
  success: boolean;
  orderId: string;
  message: string;
}
