import { escapeHtml } from '../../common/utils/strings.js';
import type { MailMessage } from '../mail/mail.service.js';

export function passwordResetEmail(p: {
  to: string;
  name: string;
  businessName: string;
  link: string;
  validMinutes: number;
}): MailMessage {
  const intro = `Someone asked to reset the password for ${p.to}. Open this link within ${p.validMinutes} minutes to choose a new password:`;
  const note = 'Choosing a new password logs you out on every device.';
  const ignore = "If you didn't ask for this, ignore this email. Your password stays the same.";

  return {
    to: p.to,
    subject: `Reset your ${p.businessName} password`,
    text: [`Hi ${p.name},`, '', intro, '', p.link, '', note, ignore].join('\n'),
    html: `<p>Hi ${escapeHtml(p.name)},</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(p.link)}">Choose a new password</a></p>
<p>${escapeHtml(note)}<br>${escapeHtml(ignore)}</p>`,
  };
}
