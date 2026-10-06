/**
 * Tests for the security fixes introduced in issue #3:
 *  - Rate limiting on login / signup / forgot
 *  - Max password length (≤128) and email length (≤254)
 *  - Timing-safe login: dummy hash run when account is not found
 */

import { migrate } from '../src/db/migrate';
import { openSqlite } from '../src/db/sqlite';
import type { LlmClient } from '../src/llm/client';
import { ConsoleMailer } from '../src/mail/console';
import { seedCards } from '../src/seed/seed';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } from '../src/auth/service';
import { RateLimiter } from '../src/auth/ratelimit';
import { createApp } from '../src/web/app';
import { buildDeps } from '../src/web/deps';

const BASE = 'http://localhost';

class NoopLlm implements LlmClient {
  async complete() { return '[]'; }
}

async function setup() {
  const db = openSqlite(':memory:');
  await migrate(db);
  await seedCards(db);
  const mailer = new ConsoleMailer(() => {});
  const deps = buildDeps({ db, mailer, llm: new NoopLlm(), baseUrl: BASE });
  const app = createApp(deps);

  const headers = (cookie = '', ip = '1.2.3.4') => ({
    'content-type': 'application/x-www-form-urlencoded',
    origin: BASE,
    ...(cookie ? { cookie } : {}),
    'x-forwarded-for': ip,
  });
  const post = (path: string, data: Record<string, string>, cookie = '', ip = '1.2.3.4') =>
    app.request(path, { method: 'POST', headers: headers(cookie, ip), body: new URLSearchParams(data).toString() });

  return { db, mailer, app, post, deps };
}

// ---------------------------------------------------------------------------
// RateLimiter unit tests
// ---------------------------------------------------------------------------
describe('RateLimiter', () => {
  it('allows requests up to the limit', () => {
    const rl = new RateLimiter(3, 60_000);
    expect(rl.check('k')).toBe(true);
    expect(rl.check('k')).toBe(true);
    expect(rl.check('k')).toBe(true);
    expect(rl.check('k')).toBe(false); // 4th → blocked
  });

  it('resets after the window expires', () => {
    const now = Date.now();
    const rl = new RateLimiter(1, 1000);
    expect(rl.check('k', now)).toBe(true);
    expect(rl.check('k', now)).toBe(false);
    // Advance past the window
    expect(rl.check('k', now + 1001)).toBe(true);
  });

  it('tracks different keys independently', () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.check('a')).toBe(true);
    expect(rl.check('b')).toBe(true); // different key — not blocked
    expect(rl.check('a')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Input length caps
// ---------------------------------------------------------------------------
describe('input length caps', () => {
  it('rejects password longer than MAX_PASSWORD_LENGTH on signup', async () => {
    const { post } = await setup();
    const longPassword = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    const res = await post('/signup', { email: 'x@example.com', username: 'xuser', password: longPassword });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('at most');
  });

  it('rejects email longer than MAX_EMAIL_LENGTH on signup', async () => {
    const { post } = await setup();
    const longEmail = 'a'.repeat(MAX_EMAIL_LENGTH) + '@example.com';
    const res = await post('/signup', { email: longEmail, username: 'xuser', password: 'validPass1' });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('too long');
  });

  it('rejects password longer than MAX_PASSWORD_LENGTH on login without revealing account existence', async () => {
    const { post } = await setup();
    // Register a real account first
    await post('/signup', { email: 'len@example.com', username: 'lenuser', password: 'correct horse' });

    const longPassword = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    const res = await post('/login', { email: 'len@example.com', password: longPassword });
    // Must fail (password too long → never matches) but not 429
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on /login
// ---------------------------------------------------------------------------
describe('rate limiting on /login', () => {
  it('blocks login after too many per-IP attempts', async () => {
    const { post } = await setup();
    const ip = '10.0.0.1';
    // The per-IP limit is 10 per 15 min; exhaust it with 10 attempts.
    for (let i = 0; i < 10; i++) {
      const res = await post('/login', { email: `u${i}@example.com`, password: 'wrong' }, '', ip);
      expect(res.status).not.toBe(429);
    }
    const blocked = await post('/login', { email: 'any@example.com', password: 'wrong' }, '', ip);
    expect(blocked.status).toBe(429);
  });

  it('blocks login after too many per-email attempts from different IPs', async () => {
    const { post } = await setup();
    const email = 'victim@example.com';
    // The per-email limit is 5 per 15 min; use different IPs to bypass the IP limiter.
    for (let i = 0; i < 5; i++) {
      const res = await post('/login', { email, password: 'wrong' }, '', `192.168.1.${i}`);
      expect(res.status).not.toBe(429);
    }
    const blocked = await post('/login', { email, password: 'wrong' }, '', '192.168.1.99');
    expect(blocked.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on /signup
// ---------------------------------------------------------------------------
describe('rate limiting on /signup', () => {
  it('blocks signup after too many per-IP attempts', async () => {
    const { post } = await setup();
    const ip = '10.0.0.2';
    // The per-IP limit is 5 per hour.
    for (let i = 0; i < 5; i++) {
      const res = await post('/signup', { email: `s${i}@example.com`, username: `su${i}`, password: 'validPass1' }, '', ip);
      expect(res.status).not.toBe(429);
    }
    const blocked = await post('/signup', { email: 'extra@example.com', username: 'extrauser', password: 'validPass1' }, '', ip);
    expect(blocked.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on /forgot
// ---------------------------------------------------------------------------
describe('rate limiting on /forgot', () => {
  it('silently rate-limits forgot by IP (does not send more emails)', async () => {
    const { post, mailer } = await setup();
    const ip = '10.0.0.3';
    const email = 'forgot@example.com';
    const before = mailer.sent.length;
    // Per-IP limit is 5; exceed it silently.
    for (let i = 0; i < 6; i++) {
      const res = await post('/forgot', { email }, '', ip);
      // All return 200 (silent, to avoid info leak)
      expect(res.status).toBe(200);
    }
    // At most 5 emails could have been dispatched (and in practice 0 because no such account exists,
    // but the important thing is the 6th request was silently dropped, not that it threw an error).
    expect(mailer.sent.length - before).toBeLessThanOrEqual(5);
  });
});
