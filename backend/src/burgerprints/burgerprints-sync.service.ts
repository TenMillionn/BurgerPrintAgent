import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Product } from './schemas/product.schema';
import { SyncProducer } from './jobs/sync.producer';
import { BpListResponse, BpListProduct } from './types/burger-print-catalog.type';
import { ProductMapper } from './mappers/product.mapper';

@Injectable()
export class BurgerprintsSyncService {
  private readonly logger = new Logger(BurgerprintsSyncService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly syncProducer: SyncProducer,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {
    this.baseUrl = 'https://catalog-api.burgerprints.com';
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCron() {
    this.logger.log('Starting scheduled cron sync for BurgerPrints catalog...');
    await this.fetchCatalogList();
  }

  async fetchCatalogList() {
    this.logger.log('Starting full catalog list sync...');
    let pageIndex = 1;
    const pageSize = 1000;
    let hasMore = true;
    let totalSynced = 0;

    while (hasMore) {
      this.logger.log(`Fetching page ${pageIndex}...`);
      try {
        const url = `${this.baseUrl}/api/v1/catalogsV2/search?pageSize=${pageSize}&pageIndex=${pageIndex}`;
        const response = await firstValueFrom(this.httpService.get<BpListResponse>(url));
        const data = response.data;

        const products = data.data?.content || [];
        if (products.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of products) {
          await this.upsertProduct(item);
          totalSynced++;

          // Enqueue the detail sync job
          await this.syncProducer.enqueueProductSync({
            shortCode: item.shortCode,
            aliasName: item.aliasName,
          });
        }

        if (products.length < pageSize) {
          hasMore = false;
        } else {
          pageIndex++;
        }
      } catch (error) {
        this.logger.error(`Error fetching page ${pageIndex}`, error);
        hasMore = false;
      }
    }

    this.logger.log(
      `Catalog list sync completed. Total synced: ${totalSynced}`,
    );
    return totalSynced;
  }

  private async upsertProduct(item: BpListProduct) {
    const mappedData = ProductMapper.fromApiList(item);
    await this.productModel.updateOne(
      { _id: item.id },
      { $set: mappedData },
      { upsert: true },
    );
  }
}
