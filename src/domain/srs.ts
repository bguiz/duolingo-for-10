/**
 * Spaced repetition in the spirit of Ebbinghaus' forgetting curve: each successful recall
 * pushes the next review further out; a failure resets the card so it is due again immediately.
 */
export const LESSON_SIZE = 10;
export const MAX_BOX = 6;
/** Review interval in days once a card reaches a box. */
export const BOX_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15, 6: 30 };

export interface SrsState {
  box: number;
  dueAt: string; // ISO timestamp
}

export function nextSrsState(prev: SrsState | undefined, recalledFirstTry: boolean, now: Date): SrsState {
  if (!recalledFirstTry) return { box: 0, dueAt: now.toISOString() };
  const box = Math.min((prev?.box ?? 0) + 1, MAX_BOX);
  const due = new Date(now.getTime() + BOX_INTERVAL_DAYS[box] * 86_400_000);
  return { box, dueAt: due.toISOString() };
}

export interface CandidateCard {
  id: number;
  difficulty: number;
  progress?: SrsState; // undefined = never seen by this user
}

/**
 * Pick lesson cards: (1) due reviews, most overdue first; (2) unseen cards, easiest first;
 * (3) if still short, seen-but-not-due cards, soonest due first.
 */
export function selectLessonCards(cards: CandidateCard[], now: Date, size = LESSON_SIZE): number[] {
  const nowIso = now.toISOString();
  const due = cards
    .filter((c) => c.progress && c.progress.dueAt <= nowIso)
    .sort((a, b) => a.progress!.dueAt.localeCompare(b.progress!.dueAt) || a.id - b.id);
  const unseen = cards.filter((c) => !c.progress).sort((a, b) => a.difficulty - b.difficulty || a.id - b.id);
  const notDue = cards
    .filter((c) => c.progress && c.progress.dueAt > nowIso)
    .sort((a, b) => a.progress!.dueAt.localeCompare(b.progress!.dueAt) || a.id - b.id);
  return [...due, ...unseen, ...notDue].slice(0, size).map((c) => c.id);
}
