import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateBusinessDto } from './business.dto.js';
import { BusinessService } from './business.service.js';

@ApiTags('Business')
@ApiBearerAuth()
@Controller({ path: 'business', version: '1' })
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  @ApiOperation({ summary: 'Business details and settings' })
  get() {
    return this.business.get();
  }

  @Patch()
  update(@Body() dto: UpdateBusinessDto) {
    return this.business.update(dto);
  }
}
