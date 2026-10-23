import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Env } from '../../config/env.js';
import type { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AccessTokenPayload, AuthUser } from '../../common/auth/auth-user.js';
import { slugify } from '../../common/utils/strings.js';
import { setupNewOrganization } from '../organization/organization-setup.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto.js';

export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number; // seconds
  refreshTokenExpiresAt: Date;
}

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto, meta: ClientMeta) {
    if (!this.config.get('ALLOW_REGISTRATION', { infer: true })) {
      throw new ForbiddenException('New sign-ups are currently closed. Ask your admin to add you.');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists. Please log in.');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const slug = `${slugify(dto.businessName) || 'business'}-${randomBytes(3).toString('hex')}`;

    const { user, organization } = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: dto.businessName, slug } });
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          memberships: { create: { organizationId: organization.id, role: 'OWNER' } },
        },
      });
      await setupNewOrganization(tx, organization.id);
      return { user, organization };
    });

    return this.issueTokens(user.id, organization.id, 'OWNER', meta);
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          where: { isActive: true, ...(dto.organizationId ? { organizationId: dto.organizationId } : {}) },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Same message for unknown email and wrong password, so emails cannot be probed.
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) throw new UnauthorizedException('Incorrect email or password');
    if (!user.isActive) throw new ForbiddenException('This account has been disabled');

    const membership = user.memberships[0];
    if (!membership) throw new ForbiddenException('You are not an active member of any business');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user.id, membership.organizationId, membership.role, meta);
  }

  /** Rotates the refresh token: the old one stops working the moment a new one is issued. */
  async refresh(refreshToken: string | undefined, meta: ClientMeta) {
    if (!refreshToken) throw new UnauthorizedException('Please log in to continue');

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
      throw new UnauthorizedException('Your session has expired, please log in again');
    }
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: session.userId, organizationId: session.organizationId } },
    });
    if (!membership?.isActive) throw new UnauthorizedException('You no longer have access to this business');

    const tokens = this.signTokens(session.userId, session.organizationId, membership.role, session.id);
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashToken(tokens.refreshToken),
        expiresAt: tokens.refreshTokenExpiresAt,
        lastUsedAt: new Date(),
        userAgent: meta.userAgent ?? session.userAgent,
        ipAddress: meta.ipAddress ?? session.ipAddress,
      },
    });
    return tokens;
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(user: AuthUser) {
    const [profile, membership, memberships] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.prisma.membership.findUniqueOrThrow({
        where: { userId_organizationId: { userId: user.userId, organizationId: user.organizationId } },
        include: { organization: true },
      }),
      this.prisma.membership.findMany({
        where: { userId: user.userId, isActive: true },
        select: { role: true, organization: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      user: profile,
      role: membership.role,
      organization: membership.organization,
      memberships: memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    if (!(await bcrypt.compare(dto.currentPassword, record.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.userId },
        data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS) },
      }),
      // Log out every other device
      this.prisma.session.updateMany({
        where: { userId: user.userId, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokens(
    userId: string,
    organizationId: string,
    role: Role,
    meta: ClientMeta,
  ): Promise<{ tokens: IssuedTokens; authUser: AuthUser }> {
    const session = await this.prisma.session.create({
      data: {
        userId,
        organizationId,
        // Placeholder, replaced right below once we know the session id
        refreshTokenHash: hashToken(randomBytes(32).toString('hex')),
        expiresAt: new Date(),
        userAgent: meta.userAgent?.slice(0, 255),
        ipAddress: meta.ipAddress,
      },
    });
    const tokens = this.signTokens(userId, organizationId, role, session.id);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashToken(tokens.refreshToken), expiresAt: tokens.refreshTokenExpiresAt },
    });
    return { tokens, authUser: { userId, organizationId, role, sessionId: session.id } };
  }

  private signTokens(userId: string, organizationId: string, role: Role, sessionId: string): IssuedTokens {
    const ttlMinutes = this.config.get('JWT_ACCESS_TTL_MINUTES', { infer: true });
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const payload: AccessTokenPayload = { sub: userId, org: organizationId, role, sid: sessionId };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: ttlMinutes * 60 }),
      refreshToken: randomBytes(48).toString('base64url'),
      accessTokenExpiresIn: ttlMinutes * 60,
      refreshTokenExpiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    };
  }
}

/** Refresh tokens are long random strings, so a fast SHA-256 is enough (no bcrypt needed). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
