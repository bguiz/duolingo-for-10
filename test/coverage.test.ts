import { loadConfig } from '../src/config';
import { fromD1 } from '../src/db/d1';
import { migrate } from '../src/db/migrate';
import { openSqlite } from '../src/db/sqlite';
import { OpencodeGoClient, type LlmClient } from '../src/llm/client';
import { generateCards, parseJsonArray, validateCard } from '../src/llm/generator';
import { CloudflareEmailMailer } from '../src/mail/cloudflare';
import { ConsoleMailer } from '../src/mail/console';
import { seedCards } from '../src/seed/seed';
import { createApp } from '../src/web/app';
import { buildDeps } from '../src/web/deps';

const BASE = 'http://localhost';

describe('config', () => {
  it('reads env with defaults', () => {
    expect(loadConfig({})).toMatchObject({ port: 3000, baseUrl: 'http://localhost:3000', dbPath: 'data/app.db', llm: { apiKey: '', model: '' } });
    const c = loadConfig({ PORT: '8080', APP_BASE_URL: 'https://x.dev/', DB_PATH: 'a.db', OPENCODE_GO_API_KEY: 'k', OPENCODE_GO_MODEL: 'm', OPENCODE_GO_BASE_URL: 'https://llm' });
    expect(c).toEqual({ port: 8080, baseUrl: 'https://x.dev', dbPath: 'a.db', llm: { apiKey: 'k', baseUrl: 'https://llm', model: 'm' } });
  });
});

describe('mailers', () => {
  it('console mailer logs and records; cloudflare mailer is a not-yet-implemented stub', async () => {
    const log = jest.fn();
    const m = new ConsoleMailer(log);
    await m.send({ to: 'a@b.c', subject: 's', text: 't' });
    expect(m.sent).toHaveLength(1);
    expect(log).toHaveBeenCalled();
    await expect(new CloudflareEmailMailer().send({ to: 'a', subject: 'b', text: 'c' })).rejects.toThrow(/not implemented/);
  });
});

describe('OpencodeGoClient', () => {
  const cfg = { apiKey: 'k', baseUrl: 'https://llm.test/v1/', model: 'm' };
  afterEach(() => jest.restoreAllMocks());

  it('refuses to run unconfigured', async () => {
    await expect(new OpencodeGoClient({ ...cfg, apiKey: '' }).complete('s', 'u')).rejects.toThrow(/not configured/);
  });

  it('posts a chat completion and returns the content', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'hola' } }] })));
    expect(await new OpencodeGoClient(cfg).complete('sys', 'usr')).toBe('hola');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string).messages).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }]);
  });

  it('throws on HTTP errors and empty replies', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await expect(new OpencodeGoClient(cfg).complete('s', 'u')).rejects.toThrow(/500/);
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] })));
    await expect(new OpencodeGoClient(cfg).complete('s', 'u')).rejects.toThrow(/no content/);
  });
});

describe('D1 adapter', () => {
  it('maps the D1 API onto Db', async () => {
    const stmt = {
      bind: jest.fn().mockReturnThis(),
      all: jest.fn().mockResolvedValue({ results: [{ a: 1 }] }),
      first: jest.fn().mockResolvedValueOnce({ a: 1 }).mockResolvedValueOnce(null),
      run: jest.fn().mockResolvedValue({ meta: { changes: 2, last_row_id: 9 } }),
    };
    const d1 = { prepare: jest.fn().mockReturnValue(stmt), exec: jest.fn().mockResolvedValue(undefined) };
    const db = fromD1(d1);
    expect(await db.all('SELECT 1')).toEqual([{ a: 1 }]);
    expect(await db.get('SELECT 1')).toEqual({ a: 1 });
    expect(await db.get('SELECT 1')).toBeUndefined();
    expect(await db.run('UPDATE x', [1])).toEqual({ changes: 2, lastId: 9 });
    await db.exec('CREATE TABLE t (id)');
    expect(d1.exec).toHaveBeenCalledWith('CREATE TABLE t (id)');
  });
});

describe('migrations', () => {
  it('are idempotent', async () => {
    const db = openSqlite(':memory:');
    await migrate(db);
    await migrate(db);
    expect((await db.all('SELECT * FROM _migrations')).length).toBeGreaterThan(0);
  });
});

describe('card validation and parsing', () => {
  const good = { sentence: 'Yo ___ feliz.', answer: ['estoy'], distractors: ['soy', 'estás', 'azul'], translation: 'I am happy.', difficulty: 2 };
  const bad = (patch: object) => validateCard({ ...good, ...patch }, new Set());

  it('accepts a good card and rejects each kind of defect', () => {
    expect(bad({})).toBeNull();
    expect(validateCard(null, new Set())).toMatch(/not an object/);
    expect(bad({ sentence: 'Sin hueco.' })).toMatch(/exactly one/);
    expect(bad({ sentence: '___ y ___' })).toMatch(/exactly one/);
    expect(bad({ translation: ' ' })).toMatch(/translation/);
    expect(bad({ answer: [] })).toMatch(/answer/);
    expect(bad({ answer: ['a', 'b', 'c', 'd', 'e'] })).toMatch(/answer/);
    expect(bad({ answer: ['dos palabras'] })).toMatch(/answer/);
    expect(bad({ distractors: 'x' })).toMatch(/distractors/);
    expect(bad({ distractors: [] })).toMatch(/4-8/);
    expect(bad({ distractors: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })).toMatch(/4-8/);
    expect(bad({ distractors: ['ESTOY', 'b', 'c'] })).toMatch(/duplicates/);
    expect(bad({ difficulty: 9 })).toMatch(/difficulty/);
    expect(bad({ difficulty: 1.5 })).toMatch(/difficulty/);
    expect(validateCard(good, new Set(['yo ___ feliz.']))).toMatch(/duplicate/);
  });

  it('extracts JSON arrays from noisy replies and rejects junk', () => {
    expect(parseJsonArray('Sure!\n```json\n[1,2]\n```')).toEqual([1, 2]);
    expect(() => parseJsonArray('no array here')).toThrow(/no JSON array/);
    expect(() => parseJsonArray('[1,2')).toThrow();
  });
});

describe('generateCards', () => {
  const card = (n: number) => ({ sentence: `Prueba ${n}: ___ aquí.`, answer: ['estoy'], distractors: ['soy', 'estás', 'azul'], translation: 'x', difficulty: 1 });
  const fake = (...replies: string[]): LlmClient & { n: number } => {
    const f = { n: 0, complete: async () => replies[f.n++] };
    return f;
  };

  it('skips the reviewer when nothing passes validation', async () => {
    const db = openSqlite(':memory:');
    await migrate(db);
    const llm = fake(JSON.stringify([{ sentence: 'bad' }]));
    const r = await generateCards(llm, db);
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0].reason).toMatch(/validation/);
    expect(llm.n).toBe(1);
  });

  it('fails closed: no verdict means rejected; in-batch duplicates are dropped', async () => {
    const db = openSqlite(':memory:');
    await migrate(db);
    const llm = fake(JSON.stringify([card(1), card(1), card(2)]), JSON.stringify([{ index: 0, approve: 'yes' }, 'junk', { index: 1, approve: true }]));
    const r = await generateCards(llm, db);
    expect(r.accepted.map((c) => c.sentence)).toEqual([card(2).sentence]);
    expect(r.rejected.map((x) => x.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate/), expect.stringMatching(/no verdict|reviewer/)]));
  });
});

describe('generation endpoint failure modes and stale submits', () => {
  async function play(llm: LlmClient) {
    const db = openSqlite(':memory:');
    await migrate(db);
    await seedCards(db);
    const mailer = new ConsoleMailer(() => {});
    const app = createApp(buildDeps({ db, mailer, llm, baseUrl: BASE }));
    const post = (path: string, data: Record<string, string>, cookie = '') =>
      app.request(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE, 'HX-Request': 'true', 'x-forwarded-for': '9.9.9.9', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
    await post('/signup', { email: 'p@example.com', username: 'perfect', password: 'password123' });
    const token = mailer.sent[0].text.match(/\/verify\/(\S+)/)![1];
    await app.request(`/verify/${token}`);
    const cookie = (await post('/login', { email: 'p@example.com', password: 'password123' })).headers.get('set-cookie')!.split(';')[0];
    const start = await post('/lessons', {}, cookie);
    const id = Number(start.headers.get('location')!.split('/').pop());
    const ids: number[] = JSON.parse((await db.get<{ card_ids: string }>('SELECT card_ids FROM lessons WHERE id = ?', [id]))!.card_ids);
    return { db, app, post, cookie, id, ids, answerFor: async (cardId: number) => (JSON.parse((await db.get<{ answer: string }>('SELECT answer FROM cards WHERE id = ?', [cardId]))!.answer) as string[]).join('|') };
  }

  it('rejects stale-tab submissions with 409 and re-renders the current card', async () => {
    const t = await play({ complete: async () => '[]' });
    const res = await t.post(`/lessons/${t.id}/answer`, { answer: 'x', attemptNo: '7' }, t.cookie);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('Card 1 of 10');
    const res2 = await t.post(`/lessons/${t.id}/answer`, { answer: 'x', cardId: String(t.ids[5]) }, t.cookie);
    expect(res2.status).toBe(409);
  });

  it('answering an already-finished lesson just shows the summary', async () => {
    const t = await play({ complete: async () => '[]' });
    for (const cid of t.ids) await t.post(`/lessons/${t.id}/answer`, { answer: await t.answerFor(cid) }, t.cookie);
    const again = await t.post(`/lessons/${t.id}/answer`, { answer: 'x' }, t.cookie);
    expect(again.status).toBe(200);
    expect(await again.text()).toContain('Perfect lesson');
    expect((await t.post('/lessons/99999/answer', { answer: 'x' }, t.cookie)).status).toBe(404);
  });

  it('returns 502 and keeps the reward when the LLM throws; 422 when everything is rejected', async () => {
    const llm = { n: 0, complete: async (): Promise<string> => { llm.n++; throw new Error('boom'); } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = await play(llm);
    for (const cid of t.ids) await t.post(`/lessons/${t.id}/answer`, { answer: await t.answerFor(cid) }, t.cookie);
    expect((await t.post(`/lessons/${t.id}/generate`, {}, t.cookie)).status).toBe(502);
    expect((await t.db.get<{ g: string | null }>('SELECT generation_used_at g FROM lessons WHERE id = ?', [t.id]))!.g).toBeNull();

    llm.complete = async () => (llm.n++ % 2 === 0 ? JSON.stringify([{ sentence: 'Prueba ___ nueva.', answer: ['soy'], distractors: ['a', 'b', 'c'], translation: 'x', difficulty: 1 }]) : JSON.stringify([{ index: 0, approve: false, reason: 'bad' }]));
    const res = await t.post(`/lessons/${t.id}/generate`, {}, t.cookie);
    expect(res.status).toBe(422);
    expect((await t.db.get<{ g: string | null }>('SELECT generation_used_at g FROM lessons WHERE id = ?', [t.id]))!.g).toBeNull();
    jest.restoreAllMocks();
  });
});
