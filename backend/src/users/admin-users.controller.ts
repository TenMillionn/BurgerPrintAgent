import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminUsersService } from './admin-users.service';

/** Admin-only user management (global JwtAuthGuard + RolesGuard → non-admin 403). */
@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly admin: AdminUsersService) {}

  @Get()
  list() {
    return this.admin.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.admin.detail(id);
  }

  @Put(':id/role')
  setRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @Req() req: any,
  ) {
    return this.admin.setRole(id, role, req.user?._id);
  }

  @Put(':id/active')
  setActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @Req() req: any,
  ) {
    return this.admin.setActive(id, !!isActive, req.user?._id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.admin.remove(id, req.user?._id);
  }
}
