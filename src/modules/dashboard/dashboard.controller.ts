import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Numbers for the home screen' })
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user.organizationId);
  }
}
