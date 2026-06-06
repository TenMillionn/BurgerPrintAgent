import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BurgerPrintsService } from './burgerprints.service';
import { BurgerPrintToolService } from './burgerprints-tool.service';

import { CatalogV1Module } from '../catalog-v1/catalog-v1.module';

import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { Variant, VariantSchema } from './schemas/product-variant.schema';
import {
  ShippingRate,
  ShippingRateSchema,
} from './schemas/product-shipping.schema';
import { BurgerprintsSyncService } from './burgerprints-sync.service';
import { SyncProducer } from './jobs/sync.producer';
import { SyncProcessor } from './jobs/sync.processor';
import { BurgerprintsSyncController } from './burgerprints-sync.controller';
import { BurgerprintsOrdersController } from './burgerprints-orders.controller';
import { BurgerprintsOrdersService } from './burgerprints-orders.service';

@Module({
  imports: [
    HttpModule,
    CatalogV1Module,
    BullModule.registerQueue({
      name: 'burgerprints-sync-queue',
    }),
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Variant.name, schema: VariantSchema },
      { name: ShippingRate.name, schema: ShippingRateSchema },
    ]),
  ],
  controllers: [BurgerprintsSyncController, BurgerprintsOrdersController],
  providers: [
    BurgerPrintsService,
    BurgerprintsSyncService,
    SyncProducer,
    SyncProcessor,
    BurgerPrintToolService,
    BurgerprintsOrdersService,
  ],

  exports: [BurgerPrintsService, BurgerPrintToolService],
})
export class BurgerPrintsModule {}
