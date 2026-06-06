import { Injectable } from '@nestjs/common';
import { CalculateCostDto } from './dto/calculate-cost.dto';
import { CreateOrderPayload } from './dto/request/create-order.dto';
import { BurgerPrintToolService } from './burgerprints-tool.service';

@Injectable()
export class BurgerprintsOrdersService {
  constructor(private readonly burgerprintsService: BurgerPrintToolService) {}

  async searchProducts(query: any) {
    return this.burgerprintsService.searchProducts(query);
  }

  async compareFactories(shortCode: string) {
    return this.burgerprintsService.compareFactories(shortCode);
  }

  async getProductVariants(shortCode: string, factory?: string) {
    return this.burgerprintsService.getProductVariants(shortCode, { factory });
  }

  async getProductDetail(shortCode: string) {
    return this.burgerprintsService.getProductDetail_card(shortCode);
  }

  async calculateCost(calculateCostDto: CalculateCostDto) {
    // In a real application, this would query a database or pricing matrix
    // based on productId, country, and state.
    // For MVP, we will return some mock calculated costs based on region and items length.

    const baseProductionFee = 15.0 * (calculateCostDto.items?.length || 1); // Base cost for MVP

    let standardShipping = 5.0;
    let expressShipping = 15.0;

    if (calculateCostDto.country !== 'US') {
      standardShipping += 10.0;
      expressShipping += 20.0;
    }

    return {
      productionFee: baseProductionFee,
      shippingOptions: [
        {
          service: 'Standard',
          cost: standardShipping,
          estimatedDays: '5-7 business days',
        },
        {
          service: 'Express',
          cost: expressShipping,
          estimatedDays: '2-3 business days',
        },
      ],
    };
  }

  async createManualOrder(createOrderPayload: CreateOrderPayload) {
    // Use the existing tool service to create the order
    try {
      // BurgerPrintsService.createOrder handles the CreateOrderPayload directly
      const response: any =
        await this.burgerprintsService.createOrder(createOrderPayload);

      if (response.error) {
        return {
          success: false,
          orderId: null,
          message: `Failed to create order: ${response.message || 'Unknown error'}`,
        };
      }

      return {
        success: true,
        orderId: response.result?.id || `MOCK-${Date.now()}`,
        message: 'Order successfully created in BurgerPrints Sandbox',
      };
    } catch (error) {
      return {
        success: false,
        orderId: null,
        message: `Failed to create order: ${error.message}`,
      };
    }
  }
}
