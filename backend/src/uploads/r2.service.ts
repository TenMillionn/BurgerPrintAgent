import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { R2Config } from '../config/configuration';

/**
 * Thin wrapper around Cloudflare R2 (S3-compatible) for hosting design/mockup
 * images. Credentials come from config and are never logged.
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly client: S3Client;
  private readonly cfg: R2Config;

  constructor(private readonly config: ConfigService) {
    this.cfg = this.config.get<R2Config>('r2') as R2Config;
    this.client = new S3Client({
      region: 'auto',
      endpoint: this.cfg.endpoint,
      credentials: {
        accessKeyId: this.cfg.accessKeyId,
        secretAccessKey: this.cfg.secretAccessKey,
      },
    });
  }

  /** Upload an object and return its public URL. */
  async put(body: Buffer, contentType: string, key: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.cfg.publicBaseUrl}/${key}`;
  }
}
