import { config } from '../../../config.js';
import type { IEmailTransport } from './email-transport.interface.js';
import { SmtpEmailTransport } from './smtp-email.transport.js';
import { mockEmailTransport } from './mock-email.transport.js';

export class EmailDeliveryDisabledError extends Error {
  constructor(message = 'Email delivery is currently disabled by configuration') {
    super(message);
    this.name = 'EmailDeliveryDisabledError';
  }
}

export class DisabledEmailTransport implements IEmailTransport {
  public async sendMail(): Promise<never> {
    throw new EmailDeliveryDisabledError();
  }

  public async verify(): Promise<boolean> {
    return false;
  }
}

let activeTransport: IEmailTransport | null = null;

export function getEmailTransport(): IEmailTransport {
  if (activeTransport) {
    return activeTransport;
  }

  // 1. If email is disabled, return disabled transport
  if (!config.EMAIL_ENABLED) {
    activeTransport = new DisabledEmailTransport();
    return activeTransport;
  }

  // 2. In non-production, if mock delivery is requested or in test mode, return mock transport
  if (
    config.NODE_ENV !== 'production' &&
    (config.EMAIL_MOCK_DELIVERY || config.NODE_ENV === 'test')
  ) {
    activeTransport = mockEmailTransport;
    return activeTransport;
  }

  // 3. In production, mock transport is strictly disallowed by EnvironmentSchema
  // Instantiate real SMTP transport
  activeTransport = new SmtpEmailTransport();
  return activeTransport;
}

export function setEmailTransportForTesting(transport: IEmailTransport | null): void {
  activeTransport = transport;
}
