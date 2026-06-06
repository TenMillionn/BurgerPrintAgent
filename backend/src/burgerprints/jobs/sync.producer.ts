import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface SyncJobData {
  shortCode: string;
  aliasName: string;
}

export interface SyncShippingJobData {
  shortCode: string;
  partnerId: string;
}

@Injectable()
export class SyncProducer {
  private readonly logger = new Logger(SyncProducer.name);

  constructor(
    @InjectQueue('burgerprints-sync-queue') private readonly syncQueue: Queue,
  ) {}

  async enqueueProductSync(data: SyncJobData) {
    // We add the job with the shortCode as the jobId to avoid duplicates
    // and configure built-in retry logic
    await this.syncQueue.add('sync-detail', data, {
      jobId: `sync-detail-${data.shortCode}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false, // Keep failed jobs for inspection
    });
  }

  async enqueueShippingSync(data: SyncShippingJobData) {
    await this.syncQueue.add('sync-shipping', data, {
      jobId: `sync-shipping-${data.shortCode}-${data.partnerId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
