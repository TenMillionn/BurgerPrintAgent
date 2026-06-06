import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Product } from '../schemas/product.schema';
import { Variant } from '../schemas/product-variant.schema';
import { ShippingRate } from '../schemas/product-shipping.schema';
import { SyncJobData, SyncShippingJobData, SyncProducer } from './sync.producer';
import { ProductMapper } from '../mappers/product.mapper';
import { BpDetailResponse, BpProductDetail, BpLocationsResponse } from '../types/burger-print-catalog.type';

@Processor('burgerprints-sync-queue', { concurrency: 5 })
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Variant.name)
    private readonly productVariantModel: Model<Variant>,
    @InjectModel(ShippingRate.name)
    private readonly productShippingModel: Model<ShippingRate>,
    @Inject(forwardRef(() => SyncProducer))
    private readonly syncProducer: SyncProducer,
  ) {
    super();
    this.baseUrl = 'https://catalog-api.burgerprints.com';
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const jobName = job.name;
    this.logger.log(`Processing job ${jobName} for product ${job.data?.shortCode}`);

    try {
      switch (jobName) {
        case 'sync-detail':
          await this.handleSyncDetail(job as Job<SyncJobData, any, string>);
          break;
        case 'sync-shipping':
          await this.handleSyncShipping(job as Job<SyncShippingJobData, any, string>);
          break;
        default:
          this.logger.warn(`Unknown job name: ${jobName}`);
      }
      this.logger.log(`Completed job ${jobName} for product ${job.data?.shortCode}`);
    } catch (error) {
      this.logger.error(`Failed job ${jobName} for product ${job.data?.shortCode}`, error);
      this.logger.error(error.stack);
      throw error; // Let BullMQ retry
    }
  }

  private async handleSyncDetail(job: Job<SyncJobData, any, string>) {
    const { shortCode, aliasName } = job.data;
    const detailData = await this.fetchAndProcessDetail(shortCode, aliasName);

    if (detailData && detailData.baseSku && Array.isArray(detailData.baseSku)) {
      const uniquePartnersMap = new Map<string, string>();
      for (const sku of detailData.baseSku) {
        if (sku.location && sku.locationName) {
          uniquePartnersMap.set(sku.location, sku.locationName);
        }
      }

      const partners = Array.from(uniquePartnersMap.entries()).map(([id, name]) => ({
        partner_id: id,
        partner_name: name,
      }));

      if (partners.length > 0) {
        await this.productModel.updateOne(
          { shortCode },
          { $set: { partners } },
        );

        for (const partner of partners) {
          await this.syncProducer.enqueueShippingSync({
            shortCode,
            partnerId: partner.partner_id,
          });
        }
      }
    }
  }

  private async handleSyncShipping(job: Job<SyncShippingJobData, any, string>) {
    const { shortCode, partnerId } = job.data;
    await this.fetchAndProcessShipping(shortCode, partnerId);

    // Mark as completely fetched after shipping info for this partner is processed
    // In a real scenario, you might want to wait for ALL shipping jobs to finish before doing this,
    // but updating the timestamp here is generally acceptable.
    await this.productModel.updateOne(
      { shortCode },
      { $set: { detailFetched: true, syncedAt: new Date() } },
    );
  }

  private async fetchAndProcessDetail(shortCode: string, aliasName: string): Promise<BpProductDetail | null> {
    if (!aliasName) return null;
    const url = `${this.baseUrl}/api/v1/catalogsV2/alias/${aliasName}`;
    const response = await firstValueFrom(this.httpService.get<BpDetailResponse>(url));
    const data = response.data.data;

    if (!data)
      throw new Error(`No detail data returned for alias ${aliasName}`);

    // Update Product using ProductMapper.fromApiDetail
    const updateProductData = ProductMapper.fromApiDetail(data);

    await this.productModel.updateOne(
      { shortCode },
      { $set: updateProductData },
    );

    // Process Variants
    if (data.baseSku && Array.isArray(data.baseSku)) {
      for (const sku of data.baseSku) {
        const variantData = ProductMapper.fromApiVariant(
          sku,
          shortCode,
          data.name,
          data.options,
        );

        await this.productVariantModel.updateOne(
          { sku: sku.sku },
          { $set: variantData },
          { upsert: true },
        );
      }
    }

    return data;
  }

  private async fetchAndProcessShipping(shortCode: string, partnerId: string) {
    const url = `${this.baseUrl}/api/v1/catalogsV2/locations?shortCode=${shortCode}&partnerId=${partnerId}`;
    const response = await firstValueFrom(this.httpService.get<BpLocationsResponse>(url));
    const data = response.data.data || [];

    for (const country of data) {
      if (country.details && Array.isArray(country.details)) {
        for (const detail of country.details) {
          const shippingData = ProductMapper.fromApiShipping(
            detail,
            shortCode,
            partnerId,
            country,
          );

          await this.productShippingModel.updateOne(
            {
              productShortCode: shortCode,
              partnerId,
              countryCode: shippingData.countryCode,
              method: shippingData.method,
            },
            { $set: shippingData },
            { upsert: true },
          );
        }
      } else if (country.details === null) {
        await this.productShippingModel.deleteMany({
          productShortCode: shortCode,
          partnerId,
          countryCode: country.countryCode,
        });
      }
    }
  }
}
