import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { BurgerprintsOrdersService } from './burgerprints-orders.service';
import { CalculateCostDto } from './dto/calculate-cost.dto';
import { CreateOrderPayload } from './dto/request/create-order.dto';
import { ApiPublic } from 'src/common/decorators/http.decorators';

@Controller('orders')
export class BurgerprintsOrdersController {
  constructor(private readonly ordersService: BurgerprintsOrdersService) {}

  @Post('calculate-cost')
  @ApiPublic()
  async calculateCost(@Body() calculateCostDto: CalculateCostDto) {
    return this.ordersService.calculateCost(calculateCostDto);
  }

  @Get('products')
  @ApiPublic()
  async getProducts(@Query() query: any) {
    return this.ordersService.searchProducts(query);
  }

  @Get('products/:shortCode/factories')
  @ApiPublic()
  async getFactories(@Param('shortCode') shortCode: string) {
    return this.ordersService.compareFactories(shortCode);
  }

  @Get('products/:shortCode/variants')
  async getVariants(
    @Param('shortCode') shortCode: string,
    @Query('factory') factory?: string,
  ) {
    return this.ordersService.getProductVariants(shortCode, factory);
  }

  @Get('products/:shortCode/detail')
  @ApiPublic()
  async getProductDetail(@Param('shortCode') shortCode: string) {
    return this.ordersService.getProductDetail(shortCode);
  }

  @Post()
  @ApiPublic()
  async createManualOrder(@Body() createOrderPayload: CreateOrderPayload) {
    return this.ordersService.createManualOrder(createOrderPayload);
  }
}
