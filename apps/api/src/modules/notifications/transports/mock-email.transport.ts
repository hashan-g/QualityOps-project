import { randomUUID } from 'node:crypto';
import type {
  IEmailTransport,
  SendEmailOptions,
  EmailSendResult,
} from './email-transport.interface.js';

export interface RecordedEmail extends SendEmailOptions {
  id: string;
  sentAt: Date;
}

export class MockEmailTransport implements IEmailTransport {
  private sentEmails: RecordedEmail[] = [];
  private failNextError: Error | null = null;
  private failCount = 0;

  public async sendMail(options: SendEmailOptions): Promise<EmailSendResult> {
    if (this.failNextError) {
      const err = this.failNextError;
      if (this.failCount > 1) {
        this.failCount--;
      } else {
        this.failNextError = null;
        this.failCount = 0;
      }
      throw err;
    }

    const messageId = `<mock-${randomUUID()}@qualityops.local>`;
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    this.sentEmails.push({
      ...options,
      id: messageId,
      sentAt: new Date(),
    });

    return {
      messageId,
      accepted: recipients,
      rejected: [],
    };
  }

  public async verify(): Promise<boolean> {
    return true;
  }

  public getSentEmails(): RecordedEmail[] {
    return [...this.sentEmails];
  }

  public clearSentEmails(): void {
    this.sentEmails = [];
    this.failNextError = null;
    this.failCount = 0;
  }

  public setFailNext(error: Error, count = 1): void {
    this.failNextError = error;
    this.failCount = count;
  }
}

export const mockEmailTransport = new MockEmailTransport();
