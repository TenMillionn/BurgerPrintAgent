import { Test, TestingModule } from '@nestjs/testing';
import { BurgerprintsSyncService } from './burgerprints-sync.service';

describe('BurgerprintsSyncService', () => {
  let service: BurgerprintsSyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BurgerprintsSyncService],
    }).compile();

    service = module.get<BurgerprintsSyncService>(BurgerprintsSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
