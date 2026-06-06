import { Controller, Post, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { BurgerprintsSyncService } from './burgerprints-sync.service';
import { ApiTags } from '@nestjs/swagger';
import { ApiPublic } from 'src/common/decorators/http.decorators';

@Controller('api/burgerprints-sync')
  @ApiTags('Burger Print Sync APIs')
export class BurgerprintsSyncController {
  private readonly logger = new Logger(BurgerprintsSyncController.name);

  constructor(private readonly syncService: BurgerprintsSyncService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiPublic({
    summary: 'Trigger manual sync of the catalog list.',
  })
  triggerSync() {
    this.logger.log('Manual sync trigger received.');

    // Fire and forget so we don't block the response
    this.syncService.fetchCatalogList().catch((err) => {
      this.logger.error('Error during manual sync', err);
    });

    return {
      message: 'Catalog sync started successfully in the background.',
      status: 'accepted',
    };
  }
}
