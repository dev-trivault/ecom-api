import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Env } from '../../config/env.js';
import { PrismaService, Tx } from '../../prisma/prisma.service.js';
import type { AccessTokenPayload, AuthUser } from '../../common/auth/auth-user.js';
import { BusinessService } from '../business/business.service.js';
import { MailService } from '../mail/mail.service.js';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto/auth.dto.js';
import { passwordResetEmail } from './password-reset-email.js';

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
const RESET_LINK_TTL_MINUTES = 30;
// At most one reset email a minute, so the form cannot be used to flood the inbox.
const RESET_EMAIL_COOLDOWN_MS = 60_000;

/** Sessions that still count as a logged-in device. */
const liveSession = () => ({ revokedAt: null, expiresAt: { gt: new Date() } });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly business: BusinessService,
    private readonly mail: MailService,
  ) {}

  publicConfig() {
    return { passwordResetByEmail: this.mail.isConfigured };
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same message for unknown email and wrong password, so emails cannot be probed.
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) throw new UnauthorizedException('Incorrect email or password');
    if (!user.isActive) throw new ForbiddenException('This account has been disabled');

    const maxDevices = this.config.get('MAX_LOGIN_DEVICES', { infer: true });
    return this.prisma.$transaction(async (tx) => {
      // Locks the user row so two logins at the same moment cannot both take the last free device.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const devices = await tx.session.count({ where: { userId: user.id, ...liveSession() } });
      if (devices >= maxDevices) {
        const escape = this.mail.isConfigured ? ', or use "Forgot password?" to log out everywhere' : '';
        throw new ForbiddenException(
          `You are already logged in on ${maxDevices} devices. Log out on one of them first${escape}.`,
        );
      }
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return this.createSession(tx, user.id, meta);
    });
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

    const nextToken = newRefreshToken();
    const expiresAt = this.refreshTokenExpiry();
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashToken(nextToken),
        expiresAt,
        lastUsedAt: new Date(),
        userAgent: meta.userAgent?.slice(0, 255) ?? session.userAgent,
        ipAddress: meta.ipAddress ?? session.ipAddress,
      },
    });
    return this.tokens(session.userId, session.id, nextToken, expiresAt);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(user: AuthUser) {
    const [profile, business] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.userId },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.business.get(),
    ]);
    return { user: profile, business };
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

  async listDevices(user: AuthUser) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.userId, ...liveSession() },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true },
    });
    return {
      maxDevices: this.config.get('MAX_LOGIN_DEVICES', { infer: true }),
      items: sessions.map((s) => ({ ...s, isCurrent: s.id === user.sessionId })),
    };
  }

  async logoutDevice(user: AuthUser, sessionId: string) {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: user.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('This device is already logged out');
  }

  async forgotPassword(dto: ForgotPasswordDto, meta: ClientMeta) {
    this.mail.assertConfigured();
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same answer whether or not the email is the login, so the form cannot be used to find it.
    if (!user?.isActive) return;
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_EMAIL_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_LINK_TTL_MINUTES * 60_000),
        ipAddress: meta.ipAddress,
      },
    });

    // The token goes in the #fragment, which browsers never send to a server, so it stays out of request logs.
    const webAppUrl = this.config.get('WEB_APP_URL', { infer: true }).replace(/\/+$/, '');
    const { name: businessName } = await this.business.get();
    const message = passwordResetEmail({
      to: user.email,
      name: user.name,
      businessName,
      link: `${webAppUrl}/reset-password#token=${token}`,
      validMinutes: RESET_LINK_TTL_MINUTES,
    });
    // Not awaited: answering before the email goes out keeps the reply as quick as for an unknown email.
    void this.mail.send(message).catch((error: unknown) => {
      this.logger.error(
        `Could not send the password reset email: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async resetPassword(dto: ResetPasswordDto) {
    const invalid = new BadRequestException('This reset link has expired or was already used. Ask for a new one.');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: { select: { isActive: true } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) throw invalid;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Conditional update: a link submitted twice at the same moment works only once.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) throw invalid;
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      // Older links stop working too, and every device is logged out.
      await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
    });
  }

  private async createSession(
    tx: Tx,
    userId: string,
    meta: ClientMeta,
  ): Promise<{ tokens: IssuedTokens; authUser: AuthUser }> {
    const refreshToken = newRefreshToken();
    const session = await tx.session.create({
      data: {
        userId,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: this.refreshTokenExpiry(),
        userAgent: meta.userAgent?.slice(0, 255),
        ipAddress: meta.ipAddress,
      },
    });
    return {
      tokens: this.tokens(userId, session.id, refreshToken, session.expiresAt),
      authUser: { userId, sessionId: session.id },
    };
  }

  private tokens(userId: string, sessionId: string, refreshToken: string, refreshTokenExpiresAt: Date): IssuedTokens {
    const ttlSeconds = this.config.get('JWT_ACCESS_TTL_MINUTES', { infer: true }) * 60;
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: ttlSeconds }),
      refreshToken,
      accessTokenExpiresIn: ttlSeconds,
      refreshTokenExpiresAt,
    };
  }

  private refreshTokenExpiry(): Date {
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  }
}

function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Refresh and reset tokens are long random strings, so a fast SHA-256 is enough (no bcrypt needed). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
