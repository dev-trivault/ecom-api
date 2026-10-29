import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { CancelDocumentDto } from '../../common/dto/cancel-document.dto.js';
import { CreateReturnDto, ReturnQueryDto } from './returns.dto.js';
import { ReturnsService } from './returns.service.js';

@ApiTags('Returns')
@ApiBearerAuth()
@Controller({ path: 'returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(@Query() query: ReturnQueryDto) {
    return this.returns.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Record a returned parcel (RTO or customer return). GOOD items go back to stock.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a return entered by mistake. Removes restocked units again.' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto) {
    return this.returns.cancel(user, id, dto.reason);
  }
}
