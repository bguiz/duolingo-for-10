import type { Db } from '../db/types';
import { SEED_CARDS } from './cards';

/** Inserts the seed cards that are not already present (sentence is unique). Returns how many were added. */
export async function seedCards(db: Db, now = new Date()): Promise<number> {
  let added = 0;
  for (const card of SEED_CARDS) {
    const r = await db.run(
      `INSERT OR IGNORE INTO cards (sentence, answer, bank, translation, difficulty, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'seed', ?)`,
      [
        card.sentence,
        JSON.stringify(card.answer),
        JSON.stringify([...card.answer, ...card.distractors]),
        card.translation,
        card.difficulty,
        now.toISOString(),
      ],
    );
    added += r.changes;
  }
  return added;
}
