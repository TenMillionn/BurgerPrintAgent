import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../common/decorators/http.decorators';
import { UserKeyService, KeyStatus } from './user-key.service';

/** Current-user settings. Auth is enforced by the global JwtAuthGuard. */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly userKey: UserKeyService) {}

  /** Save (set or replace) the seller's BurgerPrints API key. */
  @ApiAuth({ summary: 'Set my BurgerPrints API key' })
  @Put('burgerprints-key')
  async setKey(
    @Body() body: { apiKey?: string },
    @Req() req: any,
  ): Promise<KeyStatus> {
    const apiKey = (body?.apiKey ?? '').trim();
    if (apiKey.length < 8) {
      throw new BadRequestException('A valid BurgerPrints API key is required');
    }
    return this.userKey.setKey(req.user._id, apiKey);
  }

  /** Clear the stored key. */
  @ApiAuth({ summary: 'Clear my BurgerPrints API key' })
  @Delete('burgerprints-key')
  async clearKey(@Req() req: any): Promise<KeyStatus> {
    await this.userKey.clearKey(req.user._id);
    return { configured: false, last4: null };
  }

  /** Read key status only — never returns the full key. */
  @ApiAuth({ summary: 'Get my BurgerPrints API key status' })
  @Get('burgerprints-key')
  async getStatus(@Req() req: any): Promise<KeyStatus> {
    return this.userKey.getStatus(req.user._id);
  }
}
