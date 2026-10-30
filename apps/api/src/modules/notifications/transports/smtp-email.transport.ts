import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../../config.js';
import type {
  IEmailTransport,
  SendEmailOptions,
  EmailSendResult,
} from './email-transport.interface.js';

export class SmtpEmailTransport implements IEmailTransport {
  private transporter: Transporter;

  constructor() {
    const auth =
      config.SMTP_USER && config.SMTP_PASS
        ? {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS,
          }
        : undefined;

    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth,
      connectionTimeout: config.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: config.SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: config.SMTP_CONNECTION_TIMEOUT_MS,
    });
  }

  public async sendMail(options: SendEmailOptions): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: config.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      });

      return {
        messageId: info.messageId,
        accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
        rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
      };
    } catch (err) {
      // Sanitize potential SMTP password or auth string leakage in error stack/message
      const safeMessage = err instanceof Error ? err.message : String(err);
      const sanitized = config.SMTP_PASS
        ? safeMessage.split(config.SMTP_PASS).join('[REDACTED]')
        : safeMessage;
      throw new Error(`SMTP dispatch failed: ${sanitized}`);
    }
  }

  public async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      const safeMessage = err instanceof Error ? err.message : String(err);
      const sanitized = config.SMTP_PASS
        ? safeMessage.split(config.SMTP_PASS).join('[REDACTED]')
        : safeMessage;
      throw new Error(`SMTP connection verification failed: ${sanitized}`);
    }
  }
}
