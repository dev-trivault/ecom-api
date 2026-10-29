import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends email through the SMTP server in the env settings (Hostinger mail, Gmail, Zoho, Mailpit locally ...). */
@Injectable()
export class MailService {
  private readonly transport: Transporter | null;
  private readonly from: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true }) ?? user;
    this.transport =
      host && this.from
        ? createTransport({
            host,
            port: config.get('SMTP_PORT', { infer: true }),
            secure: config.get('SMTP_SECURE', { infer: true }),
            auth: user ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) ?? '' } : undefined,
          })
        : null;
  }

  get isConfigured(): boolean {
    return this.transport !== null;
  }

  assertConfigured() {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Email is not set up on the server yet, so a reset link cannot be sent. Ask the person who runs the server to add the email settings.',
      );
    }
  }

  async send(message: MailMessage): Promise<void> {
    this.assertConfigured();
    await this.transport!.sendMail({ from: this.from, ...message });
  }
}
