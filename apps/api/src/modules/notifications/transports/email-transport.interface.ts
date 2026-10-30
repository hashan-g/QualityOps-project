export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string | undefined;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string | undefined;
  attachments?: EmailAttachment[] | undefined;
}

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface IEmailTransport {
  sendMail(options: SendEmailOptions): Promise<EmailSendResult>;
  verify(): Promise<boolean>;
}
