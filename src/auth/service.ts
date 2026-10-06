import type { Db } from '../db/types';
import type { Mailer } from '../mail/types';
import { hashPassword, hashToken, newToken, verifyPassword } from './crypto';

/** Maximum lengths to bound PBKDF2 cost and storage. */
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 254;

/** A pre-computed dummy hash used to equalise login timing when no account is found. */
const DUMMY_HASH = hashPassword('__dummy__');

export interface User {
  id: number;
  email: string;
  username: string;
}

const HOUR = 3_600_000;
const SESSION_TTL = 30 * 24 * HOUR;
const VERIFY_TTL = 24 * HOUR;
const RESET_TTL = HOUR;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupResult = { ok: true } | { ok: false; error: string };

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly mailer: Mailer,
    private readonly baseUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async signup(input: { email: string; username: string; password: string }): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    if (email.length > MAX_EMAIL_LENGTH) return { ok: false, error: 'Email address is too long.' };
    if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (!USERNAME_RE.test(username)) return { ok: false, error: 'Username must be 3-20 letters, digits or underscores.' };
    if (input.password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    if (input.password.length > MAX_PASSWORD_LENGTH) return { ok: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };

    // Same response whether or not the email exists, so signup can't be used to probe for accounts.
    const existingByEmail = await this.db.get<{ id: number; verified_at: string | null }>(
      'SELECT id, verified_at FROM users WHERE email = ?',
      [email],
    );
    if (existingByEmail) {
      // If unverified, resend a fresh verify token so they're not permanently locked out.
      if (!existingByEmail.verified_at) await this.sendToken(existingByEmail.id, email, 'verify');
      return { ok: true };
    }

    if (await this.db.get('SELECT 1 FROM users WHERE username = ?', [username])) {
      return { ok: false, error: 'That username is taken.' };
    }

    const r = await this.db.run(
      'INSERT INTO users (email, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [email, username, await hashPassword(input.password), this.now().toISOString()],
    );
    await this.db.run('INSERT INTO user_stats (user_id, streak) VALUES (?, 0)', [r.lastId]);
    await this.sendToken(r.lastId, email, 'verify');
    return { ok: true };
  }

  async verifyEmail(token: string): Promise<boolean> {
    const userId = await this.consumeToken(token, 'verify');
    if (!userId) return false;
    await this.db.run('UPDATE users SET verified_at = COALESCE(verified_at, ?) WHERE id = ?', [this.now().toISOString(), userId]);
    return true;
  }

  /** Returns a session token on success; `unverified` if the password was right but the email is not verified. */
  async login(emailInput: string, password: string): Promise<{ token: string } | 'unverified' | null> {
    if (password.length > MAX_PASSWORD_LENGTH) {
      // Run dummy work so timing is the same as a real miss.
      await verifyPassword(password.slice(0, MAX_PASSWORD_LENGTH), await DUMMY_HASH);
      return null;
    }
    const row = await this.db.get<{ id: number; password_hash: string; verified_at: string | null }>(
      'SELECT id, password_hash, verified_at FROM users WHERE email = ?',
      [emailInput.trim().toLowerCase()],
    );
    // Always run a hash comparison so response time doesn't reveal whether the account exists.
    const hashToVerify = row?.password_hash ?? await DUMMY_HASH;
    if (!await verifyPassword(password, hashToVerify) || !row) return null;
    if (!row.verified_at) return 'unverified';
    const token = newToken();
    await this.db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
      await hashToken(token),
      row.id,
      new Date(this.now().getTime() + SESSION_TTL).toISOString(),
    ]);
    return { token };
  }

  async userForSession(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const row = await this.db.get<User & { expires_at: string }>(
      `SELECT u.id, u.email, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      [await hashToken(token)],
    );
    if (!row || row.expires_at <= this.now().toISOString()) return null;
    return { id: row.id, email: row.email, username: row.username };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.run('DELETE FROM sessions WHERE token_hash = ?', [await hashToken(token)]);
  }

  /** Always resolves silently, whether or not the account exists. */
  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const row = await this.db.get<{ id: number }>('SELECT id FROM users WHERE email = ? AND verified_at IS NOT NULL', [email]);
    if (row) await this.sendToken(row.id, email, 'reset');
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    const userId = await this.consumeToken(token, 'reset');
    if (!userId) return { ok: false, error: 'This reset link is invalid or has expired.' };
    await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword), userId]);
    await this.db.run('DELETE FROM sessions WHERE user_id = ?', [userId]); // sign out everywhere
    return { ok: true };
  }

  async isTokenValid(token: string, kind: 'verify' | 'reset'): Promise<boolean> {
    const row = await this.db.get<{ expires_at: string; used_at: string | null }>(
      'SELECT expires_at, used_at FROM email_tokens WHERE token_hash = ? AND kind = ?',
      [await hashToken(token), kind],
    );
    return !!row && !row.used_at && row.expires_at > this.now().toISOString();
  }

  private async sendToken(userId: number, email: string, kind: 'verify' | 'reset'): Promise<void> {
    const token = newToken();
    const ttl = kind === 'verify' ? VERIFY_TTL : RESET_TTL;
    await this.db.run('INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', [
      await hashToken(token),
      userId,
      kind,
      new Date(this.now().getTime() + ttl).toISOString(),
    ]);
    const path = kind === 'verify' ? 'verify' : 'reset';
    const url = `${this.baseUrl}/${path}/${token}`;
    await this.mailer.send(
      kind === 'verify'
        ? { to: email, subject: 'Verify your email', text: `Welcome! Verify your email: ${url}` }
        : { to: email, subject: 'Reset your password', text: `Reset your password (valid for 1 hour): ${url}` },
    );
  }

  /** Marks the token used (atomically) and returns the user id, or null if invalid/expired/used. */
  private async consumeToken(token: string, kind: 'verify' | 'reset'): Promise<number | null> {
    const hash = await hashToken(token);
    const nowIso = this.now().toISOString();
    const r = await this.db.run(
      'UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?',
      [nowIso, hash, kind, nowIso],
    );
    if (r.changes !== 1) return null;
    const row = await this.db.get<{ user_id: number }>('SELECT user_id FROM email_tokens WHERE token_hash = ?', [hash]);
    return row?.user_id ?? null;
  }
}
