export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Adapter: swap implementations per environment (console locally, Cloudflare Email Service when deployed). */
export interface Mailer {
  send(email: Email): Promise<void>;
}
