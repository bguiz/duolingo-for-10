import type { Email, Mailer } from './types';

/** Local/debug mailer: prints emails to stdout and keeps them in memory (handy for tests). */
export class ConsoleMailer implements Mailer {
  readonly sent: Email[] = [];

  constructor(private readonly log: (msg: string) => void = console.log) {}

  async send(email: Email): Promise<void> {
    this.sent.push(email);
    this.log(`\n--- [mail:debug] to=${email.to} subject="${email.subject}" ---\n${email.text}\n---\n`);
  }
}
