import type { Email, Mailer } from './types';

/** Placeholder for Cloudflare Email Service; wire it up when deploying. */
export class CloudflareEmailMailer implements Mailer {
  async send(_email: Email): Promise<void> {
    throw new Error('CloudflareEmailMailer is not implemented yet (deployment is out of scope for now)');
  }
}
