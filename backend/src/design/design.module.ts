import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { UploadsModule } from '../uploads/uploads.module';
import { DesignController } from './design.controller';
import { DesignAssetService } from './design-asset.service';
import { ImageProcessingService } from './image-processing.service';
import { DesignAsset, DesignAssetSchema } from './schemas/design-asset.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DesignAsset.name, schema: DesignAssetSchema },
    ]),
    HttpModule,
    UploadsModule, // provides R2Service
  ],
  controllers: [DesignController],
  providers: [DesignAssetService, ImageProcessingService],
  exports: [DesignAssetService, ImageProcessingService],
})
export class DesignModule {}
