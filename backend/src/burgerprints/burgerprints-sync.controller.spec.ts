import { Test, TestingModule } from '@nestjs/testing';
import { BurgerprintsSyncController } from './burgerprints-sync.controller';

describe('BurgerprintsSyncController', () => {
  let controller: BurgerprintsSyncController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BurgerprintsSyncController],
    }).compile();

    controller = module.get<BurgerprintsSyncController>(
      BurgerprintsSyncController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
