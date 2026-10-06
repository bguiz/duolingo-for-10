import { hashPassword, verifyPassword } from '../src/auth/crypto';
import { migrate } from '../src/db/migrate';
import { openSqlite } from '../src/db/sqlite';
import type { Db } from '../src/db/types';
import type { LlmClient } from '../src/llm/client';
import { ConsoleMailer } from '../src/mail/console';
import { seedCards } from '../src/seed/seed';
import { createApp } from '../src/web/app';
import { buildDeps } from '../src/web/deps';

const BASE = 'http://localhost';

/** Fake LLM: 1st call generates 3 cards, 2nd (reviewer) approves two and rejects one. */
class FakeLlm implements LlmClient {
  calls: { system: string; user: string }[] = [];
  async complete(system: string, user: string) {
    this.calls.push({ system, user });
    if (this.calls.length % 2 === 1) {
      return '```json\n' + JSON.stringify([1, 2, 3].map((n) => ({
        sentence: `Frase de prueba número ${n}: yo ___ contento.`,
        answer: ['estoy'],
        distractors: ['soy', 'estás', 'azul'],
        translation: `Test sentence ${n}: I am happy.`,
        difficulty: 2,
      }))) + '\n```';
    }
    return JSON.stringify([{ index: 0, approve: true }, { index: 1, approve: false, reason: 'unnatural' }, { index: 2, approve: true }]);
  }
}

async function setup() {
  const db = openSqlite(':memory:');
  await migrate(db);
  await seedCards(db);
  const mailer = new ConsoleMailer(() => {});
  const llm = new FakeLlm();
  const deps = buildDeps({ db, mailer, llm, baseUrl: BASE });
  const app = createApp(deps);

  const form = (cookie: string, hx = false) => ({
    'content-type': 'application/x-www-form-urlencoded',
    origin: BASE,
    ...(cookie ? { cookie } : {}),
    ...(hx ? { 'HX-Request': 'true' } : {}),
  });
  const post = (path: string, data: Record<string, string>, cookie = '', hx = false) =>
    app.request(path, { method: 'POST', headers: form(cookie, hx), body: new URLSearchParams(data).toString() });
  const get = (path: string, cookie = '') => app.request(path, { headers: cookie ? { cookie } : {} });

  async function register(username: string) {
    const email = `${username}@example.com`;
    expect((await post('/signup', { email, username, password: 'correct horse' })).status).toBe(200);
    const link = mailer.sent.filter((m) => m.to === email).pop()!.text.match(/\/verify\/(\S+)/)![1];
    expect((await get(`/verify/${link}`)).status).toBe(200);
    const res = await post('/login', { email, password: 'correct horse' });
    expect(res.status).toBe(302);
    return res.headers.get('set-cookie')!.split(';')[0];
  }

  /** Plays a whole lesson. `mistakes` = how many wrong attempts to make on the first card. */
  async function playLesson(db: Db, cookie: string, mistakes = 0) {
    const start = await post('/lessons', {}, cookie);
    const lessonId = Number(start.headers.get('location')!.split('/').pop());
    const lesson = (await db.get<{ card_ids: string }>('SELECT card_ids FROM lessons WHERE id = ?', [lessonId]))!;
    const ids: number[] = JSON.parse(lesson.card_ids);
    expect(ids).toHaveLength(10);
    let last = '';
    for (let i = 0; i < ids.length; i++) {
      const card = (await db.get<{ answer: string }>('SELECT answer FROM cards WHERE id = ?', [ids[i]]))!;
      if (i === 0) for (let m = 0; m < mistakes; m++) {
        const wrong = await post(`/lessons/${lessonId}/answer`, { answer: 'zzz' }, cookie, true);
        expect(await wrong.text()).toContain('Not quite');
      }
      const res = await post(`/lessons/${lessonId}/answer`, { answer: (JSON.parse(card.answer) as string[]).join('|') }, cookie, true);
      last = await res.text();
    }
    return { lessonId, last };
  }

  return { db, mailer, llm, app, post, get, register, playLesson };
}

describe('auth', () => {
  it('hashes passwords with salt and verifies them', async () => {
    const h = await hashPassword('secret123');
    expect(await verifyPassword('secret123', h)).toBe(true);
    expect(await verifyPassword('secret124', h)).toBe(false);
    expect(h).not.toBe(await hashPassword('secret123'));
  });

  it('resends a fresh verify token when signing up with an existing unverified email', async () => {
    const t = await setup();
    const email = 'newbie@example.com';
    // First signup — no verification yet
    await t.post('/signup', { email, username: 'newbie', password: 'password1' });
    expect((await t.post('/login', { email, password: 'password1' })).status).toBe(401); // still unverified

    // Second signup with same email — should resend a fresh verify link
    await t.post('/signup', { email, username: 'newbie', password: 'password1' });
    const allSent = t.mailer.sent.filter((m) => m.to === email);
    expect(allSent).toHaveLength(2); // two verify emails sent

    // Use the latest (fresh) token to verify
    const freshToken = allSent.at(-1)!.text.match(/\/verify\/(\S+)/)![1];
    expect((await t.get(`/verify/${freshToken}`)).status).toBe(200);
    expect((await t.post('/login', { email, password: 'password1' })).status).toBe(302); // now works
  });

  it('requires email verification, and supports password reset via emailed link', async () => {
    const t = await setup();
    await t.post('/signup', { email: 'a@example.com', username: 'alice', password: 'password1' });
    expect((await t.post('/login', { email: 'a@example.com', password: 'password1' })).status).toBe(401); // unverified
    const cookie = await t.register('bob');
    expect((await t.get('/lessons/1', cookie)).status).toBe(404);

    await t.post('/forgot', { email: 'bob@example.com' });
    const token = t.mailer.sent.at(-1)!.text.match(/\/reset\/(\S+)/)![1];
    expect((await t.post(`/reset/${token}`, { password: 'new password1' })).status).toBe(200);
    expect((await t.post(`/reset/${token}`, { password: 'again again1' })).status).toBe(400); // single use
    expect((await t.post('/login', { email: 'bob@example.com', password: 'correct horse' })).status).toBe(401);
    expect((await t.post('/login', { email: 'bob@example.com', password: 'new password1' })).status).toBe(302);
    expect((await t.get('/', cookie)).headers.get('set-cookie')).toBeNull();
    expect(await (await t.get('/', cookie)).text()).toContain('Log in'); // old session was revoked
  });
});

describe('lessons, leaderboard and access rule', () => {
  it('public leaderboard shows points/streak but nothing about lessons; lessons are private', async () => {
    const t = await setup();
    const alice = await t.register('alice');
    const bob = await t.register('bob');
    const { lessonId } = await t.playLesson(t.db, alice);

    const board = await (await t.get('/leaderboard')).text(); // no cookie: public
    expect(board).toContain('alice');
    expect(board).toMatch(/<td class="n">100<\/td>/);
    expect(board).toContain('🔥 1');
    expect(board).not.toContain(`/lessons/${lessonId}`);

    expect((await t.get(`/lessons/${lessonId}`)).status).toBe(302); // logged out → login
    expect((await t.get(`/lessons/${lessonId}`, bob)).status).toBe(404); // another user's lesson
    expect((await t.post(`/lessons/${lessonId}/answer`, { answer: 'x' }, bob, true)).status).toBe(404);
    expect((await t.get(`/lessons/${lessonId}`, alice)).status).toBe(200);
  });

  it("always shows the viewer's own rank, even outside the top 10", async () => {
    const t = await setup();
    const cookie = await t.register('zed');
    for (let i = 0; i < 11; i++) {
      await t.db.run("INSERT INTO users (email, username, password_hash, verified_at, created_at) VALUES (?, ?, 'x', 'now', 'now')", [`u${i}@x.com`, `user${i}`]);
      const id = (await t.db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', [`user${i}`]))!.id;
      await t.db.run('INSERT INTO score_events (user_id, points, day) VALUES (?, 50, ?)', [id, new Date().toISOString().slice(0, 10)]);
    }
    const html = await (await t.get('/leaderboard?period=monthly', cookie)).text();
    expect(html).toContain('zed (you)');
  });

  it('retries are scored on attempts (a miss means no perfect score and no reward)', async () => {
    const t = await setup();
    const cookie = await t.register('carol');
    const { lessonId, last } = await t.playLesson(t.db, cookie, 1);
    expect(last).toContain('Lesson complete!');
    expect(last).toContain('10/11');
    expect(last).not.toContain('Generate new cards');
    const res = await t.post(`/lessons/${lessonId}/generate`, {}, cookie, true);
    expect(res.status).toBe(403);
    expect(t.llm.calls).toHaveLength(0);
  });

  it('perfect lesson unlocks exactly one generation: generator + separate reviewer, rejects respected', async () => {
    const t = await setup();
    const cookie = await t.register('dave');
    const { lessonId, last } = await t.playLesson(t.db, cookie);
    expect(last).toContain('Perfect lesson');
    expect(last).toContain('Generate new cards');

    const before = (await t.db.get<{ n: number }>('SELECT COUNT(*) n FROM cards'))!.n;
    const res = await t.post(`/lessons/${lessonId}/generate`, {}, cookie, true);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Added 2 new cards');
    expect((await t.db.get<{ n: number }>('SELECT COUNT(*) n FROM cards'))!.n).toBe(before + 2);
    expect(t.llm.calls).toHaveLength(2); // two separate calls
    expect(t.llm.calls[1].user).not.toContain('Do not reuse'); // reviewer context is independent

    expect((await t.post(`/lessons/${lessonId}/generate`, {}, cookie, true)).status).toBe(409); // one time only
    expect(t.llm.calls).toHaveLength(2);
  });

  it('rejects generation for another user, an unfinished lesson, and a stale lesson', async () => {
    const t = await setup();
    const eve = await t.register('eve');
    const mallory = await t.register('mallory');
    const { lessonId } = await t.playLesson(t.db, eve);
    expect((await t.post(`/lessons/${lessonId}/generate`, {}, mallory, true)).status).toBe(404);
    expect((await t.post(`/lessons/${lessonId}/generate`, {}, '', true)).status).toBe(401);

    const open = await t.post('/lessons', {}, eve);
    const openId = Number(open.headers.get('location')!.split('/').pop());
    expect((await t.post(`/lessons/${openId}/generate`, {}, eve, true)).status).toBe(403);

    await t.db.run("UPDATE lessons SET completed_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", [lessonId]);
    expect((await t.post(`/lessons/${lessonId}/generate`, {}, eve, true)).status).toBe(403);
    expect(t.llm.calls).toHaveLength(0);
  });

  it('double-submit on a finished lesson returns the summary panel, not a 404 error', async () => {
    const t = await setup();
    const cookie = await t.register('grace');
    const { lessonId } = await t.playLesson(t.db, cookie);

    // POST the answer endpoint again after lesson is complete — should return summary, not 404 text.
    const res = await t.post(`/lessons/${lessonId}/answer`, { answer: 'anything' }, cookie, true);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Lesson complete|Perfect lesson/);
    expect(body).not.toContain('not found');
  });

  it('stale-tab answer (wrong cardId) is rejected with 409 and returns the current panel', async () => {
    const t = await setup();
    const cookie = await t.register('henry');
    const start = await t.post('/lessons', {}, cookie);
    const lessonId = Number(start.headers.get('location')!.split('/').pop());
    const lesson = (await t.db.get<{ card_ids: string }>('SELECT card_ids FROM lessons WHERE id = ?', [lessonId]))!;
    const ids: number[] = JSON.parse(lesson.card_ids);

    // Submit with a wrong cardId (simulate stale tab pointing at a previous card).
    const res = await t.post(`/lessons/${lessonId}/answer`, { answer: 'anything', cardId: '99999', attemptNo: '1' }, cookie, true);
    expect(res.status).toBe(409);
    const body = await res.text();
    // Response should be a card panel for the current lesson, not an error text.
    expect(body).toContain('Fill in the blank');
  });

  it('double-submit (same cardId but wrong attemptNo) is rejected with 409', async () => {
    const t = await setup();
    const cookie = await t.register('iris');
    const start = await t.post('/lessons', {}, cookie);
    const lessonId = Number(start.headers.get('location')!.split('/').pop());
    const lesson = (await t.db.get<{ card_ids: string }>('SELECT card_ids FROM lessons WHERE id = ?', [lessonId]))!;
    const ids: number[] = JSON.parse(lesson.card_ids);
    const firstCard = (await t.db.get<{ id: number; answer: string }>('SELECT id, answer FROM cards WHERE id = ?', [ids[0]]))!;

    // Submit a correct answer once — advances to attemptNo 1 → card answered.
    await t.post(`/lessons/${lessonId}/answer`, { answer: (JSON.parse(firstCard.answer) as string[]).join('|'), cardId: String(firstCard.id), attemptNo: '1' }, cookie, true);

    // Re-submit the same card with attemptNo=1 (stale double-submit).
    const res = await t.post(`/lessons/${lessonId}/answer`, { answer: (JSON.parse(firstCard.answer) as string[]).join('|'), cardId: String(firstCard.id), attemptNo: '1' }, cookie, true);
    expect(res.status).toBe(409);
  });

  it('spaced repetition: a second lesson starts with unseen cards, and mistakes come back first', async () => {
    const t = await setup();
    const cookie = await t.register('frank');
    await t.playLesson(t.db, cookie, 1); // card #1 missed first try → box 0, due immediately
    const missed = (await t.db.get<{ card_ids: string }>('SELECT card_ids FROM lessons ORDER BY id LIMIT 1'))!;
    const firstCard = JSON.parse(missed.card_ids)[0];
    const next = await t.post('/lessons', {}, cookie);
    const nextId = Number(next.headers.get('location')!.split('/').pop());
    const ids = JSON.parse((await t.db.get<{ card_ids: string }>('SELECT card_ids FROM lessons WHERE id = ?', [nextId]))!.card_ids);
    expect(ids[0]).toBe(firstCard);
  });
});
