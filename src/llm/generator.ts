import type { Db } from '../db/types';
import type { LlmClient } from './client';

export interface NewCard {
  sentence: string;
  answer: string[];
  distractors: string[];
  translation: string;
  difficulty: number;
}

export const BATCH_SIZE = 10;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Structural validation; returns an error message or null. Does not judge the Spanish. */
export function validateCard(card: unknown, taken: Set<string>): string | null {
  const c = card as Partial<NewCard> | null;
  if (!c || typeof c !== 'object') return 'not an object';
  if (typeof c.sentence !== 'string' || c.sentence.split('___').length !== 2) return 'sentence must contain exactly one ___';
  if (typeof c.translation !== 'string' || !c.translation.trim()) return 'missing translation';
  const words = (a: unknown) => Array.isArray(a) && a.every((w) => typeof w === 'string' && w.trim() && !/\s/.test(w.trim()));
  if (!words(c.answer) || c.answer!.length < 1 || c.answer!.length > 4) return 'answer must be 1-4 single words';
  if (!words(c.distractors)) return 'distractors must be single words';
  const bankSize = c.answer!.length + c.distractors!.length;
  if (bankSize < 4 || bankSize > 8) return 'word bank must have 4-8 words';
  const answerSet = new Set(c.answer!.map(norm));
  if (c.distractors!.some((d) => answerSet.has(norm(d)))) return 'a distractor duplicates an answer word';
  if (!Number.isInteger(c.difficulty) || c.difficulty! < 1 || c.difficulty! > 5) return 'difficulty must be 1-5';
  if (taken.has(norm(c.sentence))) return 'duplicate sentence';
  return null;
}

/** Extracts the first JSON array from an LLM reply (tolerates code fences / prose). */
export function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no JSON array in LLM reply');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('LLM reply was not an array');
  return parsed;
}

const GENERATOR_SYSTEM = `You are an expert Spanish teacher writing exercises for English speakers learning Spanish.
Each exercise is a Spanish sentence with ONE blank written as ___ . The learner drags words from a word bank into the blank, in order.
Reply with ONLY a JSON array (no prose) of objects with keys:
  "sentence": Spanish sentence containing exactly one "___",
  "answer": array of 1-4 words (in order) that fill the blank to make a correct, natural sentence,
  "distractors": array of wrong words (answer + distractors must total 4 to 8 words); no distractor may also work in the blank,
  "translation": the English translation of the completed sentence,
  "difficulty": integer 1 (beginner) to 5 (advanced).
Words must not contain spaces. Vary topics, tenses and difficulty.`;

const REVIEWER_SYSTEM = `You are a strict Spanish language reviewer. You will be given candidate exercises.
For each, check: (1) the completed sentence (blank filled with the answer words in order) is correct, natural Spanish;
(2) the English translation is accurate; (3) the distractors do NOT also produce a correct sentence, alone or in any order;
(4) the difficulty rating is reasonable; (5) the content is appropriate for all ages.
Reply with ONLY a JSON array of {"index": number, "approve": boolean, "reason": string}, one entry per candidate. Reject anything doubtful.`;

export interface GenerationResult {
  accepted: NewCard[];
  rejected: { card: unknown; reason: string }[];
}

/**
 * Two independent LLM calls (separate contexts): one generates a batch, a second reviews it.
 * The reviewer fails closed: a card is only accepted with an explicit approve === true.
 */
export async function generateCards(llm: LlmClient, db: Db): Promise<GenerationResult> {
  const existing = await db.all<{ sentence: string }>('SELECT sentence FROM cards ORDER BY id DESC LIMIT 40');
  const taken = new Set(existing.map((r) => norm(r.sentence)));

  const raw = await llm.complete(
    GENERATOR_SYSTEM,
    `Write ${BATCH_SIZE} new exercises. Do not reuse these sentences:\n${existing.map((r) => `- ${r.sentence}`).join('\n')}`,
  );
  const candidates = parseJsonArray(raw).slice(0, BATCH_SIZE);

  const rejected: GenerationResult['rejected'] = [];
  const valid: NewCard[] = [];
  for (const cand of candidates) {
    const err = validateCard(cand, taken);
    if (err) {
      rejected.push({ card: cand, reason: `validation: ${err}` });
    } else {
      valid.push(cand as NewCard);
      taken.add(norm((cand as NewCard).sentence)); // also dedupes within the batch
    }
  }
  if (valid.length === 0) return { accepted: [], rejected };

  const verdictRaw = await llm.complete(REVIEWER_SYSTEM, JSON.stringify(valid.map((c, index) => ({ index, ...c })), null, 1));
  const verdicts = new Map<number, { approve: unknown; reason?: string }>();
  for (const v of parseJsonArray(verdictRaw) as { index: number; approve: unknown; reason?: string }[]) {
    if (v && Number.isInteger(v.index)) verdicts.set(v.index, v);
  }

  const accepted: NewCard[] = [];
  valid.forEach((card, i) => {
    const v = verdicts.get(i);
    if (v?.approve === true) accepted.push(card);
    else rejected.push({ card, reason: `reviewer: ${v?.reason ?? 'no verdict'}` });
  });
  return { accepted, rejected };
}

export async function insertGeneratedCards(db: Db, cards: NewCard[], now: Date): Promise<number> {
  let added = 0;
  for (const c of cards) {
    const r = await db.run(
      `INSERT OR IGNORE INTO cards (sentence, answer, bank, translation, difficulty, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'llm', ?)`,
      [c.sentence.trim(), JSON.stringify(c.answer), JSON.stringify([...c.answer, ...c.distractors]), c.translation.trim(), c.difficulty, now.toISOString()],
    );
    added += r.changes;
  }
  return added;
}
