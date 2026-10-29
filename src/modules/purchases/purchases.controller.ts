import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { CancelDocumentDto } from '../../common/dto/cancel-document.dto.js';
import { CreatePurchaseDto, PurchaseQueryDto } from './purchases.dto.js';
import { PurchasesService } from './purchases.service.js';

@ApiTags('Purchases (stock in)')
@ApiBearerAuth()
@Controller({ path: 'purchases', version: '1' })
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  list(@Query() query: PurchaseQueryDto) {
    return this.purchases.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Record a wholesale purchase. Adds the units to stock.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    return this.purchases.create(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a purchase entered by mistake. Removes its units from stock.' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto) {
    return this.purchases.cancel(user, id, dto.reason);
  }
}
