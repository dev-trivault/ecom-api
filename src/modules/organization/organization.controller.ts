import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { AddMemberDto, ResetMemberPasswordDto, UpdateMemberDto, UpdateOrganizationDto } from './organization.dto.js';
import { OrganizationService } from './organization.service.js';

@ApiTags('Business & team')
@ApiBearerAuth()
@Controller({ path: 'organization', version: '1' })
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  @ApiOperation({ summary: 'Current business profile and settings' })
  get(@CurrentUser() user: AuthUser) {
    return this.organization.get(user.organizationId);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizationDto) {
    return this.organization.update(user.organizationId, dto);
  }

  @Get('members')
  @Roles('OWNER', 'ADMIN')
  listMembers(@CurrentUser() user: AuthUser) {
    return this.organization.listMembers(user.organizationId);
  }

  @Post('members')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Give someone access to this business' })
  addMember(@CurrentUser() user: AuthUser, @Body() dto: AddMemberDto) {
    return this.organization.addMember(user, dto);
  }

  @Patch('members/:id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Change a member role or turn their access off' })
  updateMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto) {
    return this.organization.updateMember(user, id, dto);
  }

  @Post('members/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Set a new password for a team member' })
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetMemberPasswordDto,
  ) {
    await this.organization.resetMemberPassword(user, id, dto);
  }
}
