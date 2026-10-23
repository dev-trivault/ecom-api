import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { patchText } from '../../common/utils/strings.js';
import { AddMemberDto, ResetMemberPasswordDto, UpdateMemberDto, UpdateOrganizationDto } from './organization.dto.js';

const memberSelect = {
  id: true,
  role: true,
  isActive: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
} as const;

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  get(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  }

  update(organizationId: string, dto: UpdateOrganizationDto) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name,
        gstin: patchText(dto.gstin, (v) => v.toUpperCase()),
        phone: patchText(dto.phone),
        email: patchText(dto.email, (v) => v.toLowerCase()),
        address: patchText(dto.address),
        timezone: dto.timezone,
        isNegativeStockAllowed: dto.isNegativeStockAllowed,
      },
    });
  }

  listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: memberSelect,
    });
  }

  async addMember(actor: AuthUser, dto: AddMemberDto) {
    this.assertCanGrant(actor, dto.role);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { memberships: { where: { organizationId: actor.organizationId } } },
    });
    if (existingUser?.memberships.length) {
      throw new ConflictException(`${dto.email} is already a member of this business`);
    }

    return this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: { name: dto.name, email: dto.email, passwordHash: await bcrypt.hash(dto.password, 12) },
        }));
      return tx.membership.create({
        data: { userId: user.id, organizationId: actor.organizationId, role: dto.role },
        select: memberSelect,
      });
    });
  }

  async updateMember(actor: AuthUser, membershipId: string, dto: UpdateMemberDto) {
    const membership = await this.findMembership(actor, membershipId);
    if (membership.userId === actor.userId) throw new BadRequestException('You cannot change your own access');
    if (membership.role === 'OWNER') this.assertCanGrant(actor, 'OWNER');
    if (dto.role) this.assertCanGrant(actor, dto.role);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: { role: dto.role, isActive: dto.isActive },
        select: memberSelect,
      });
      // Role or access changed: force a fresh login on every device so it takes effect now.
      await tx.session.updateMany({
        where: { userId: membership.userId, organizationId: actor.organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return updated;
    });
  }

  async resetMemberPassword(actor: AuthUser, membershipId: string, dto: ResetMemberPasswordDto) {
    const membership = await this.findMembership(actor, membershipId);
    if (membership.role === 'OWNER') this.assertCanGrant(actor, 'OWNER');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: membership.userId },
        data: { passwordHash: await bcrypt.hash(dto.password, 12) },
      }),
      this.prisma.session.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async findMembership(actor: AuthUser, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: actor.organizationId },
    });
    if (!membership) throw new NotFoundException('Team member not found');
    return membership;
  }

  /** Only an owner can create or change other owners. */
  private assertCanGrant(actor: AuthUser, role: string) {
    if (role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only an owner can manage owners');
    }
  }
}
