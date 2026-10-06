import { addDays } from './dates';

export const POINTS_FIRST_TRY = 10;
export const POINTS_RETRY = 2;
export const POINTS_WRONG = 0;

export interface Attempt {
  cardId: number;
  attemptNo: number; // 1-based, per card
  correct: boolean;
}

/** Points for one attempt: 10 if right first time, 2 if right after a reattempt, 0 if wrong. */
export function attemptPoints(a: Pick<Attempt, 'attemptNo' | 'correct'>): number {
  if (!a.correct) return POINTS_WRONG;
  return a.attemptNo === 1 ? POINTS_FIRST_TRY : POINTS_RETRY;
}

export interface LessonScore {
  points: number;
  correctAttempts: number;
  totalAttempts: number;
  /** Perfect = every card right on the first attempt (so N/N, no reattempts). */
  perfect: boolean;
}

export function scoreLesson(attempts: Attempt[], cardCount: number): LessonScore {
  const correctAttempts = attempts.filter((a) => a.correct).length;
  const totalAttempts = attempts.length;
  return {
    points: attempts.reduce((sum, a) => sum + attemptPoints(a), 0),
    correctAttempts,
    totalAttempts,
    perfect: totalAttempts === cardCount && correctAttempts === cardCount,
  };
}

export interface StreakState {
  streak: number;
  lastActiveDay: string | null;
}

/** Streak after completing a lesson on `today` (UTC). One lesson per day counts; a missed day resets. */
export function streakAfterLesson(prev: StreakState, today: string): StreakState {
  if (prev.lastActiveDay === today) return prev;
  const continues = prev.lastActiveDay === addDays(today, -1);
  return { streak: continues ? prev.streak + 1 : 1, lastActiveDay: today };
}

/** Streak to display: it has lapsed (reset to 0) if the last active day is before yesterday. */
export function effectiveStreak(s: StreakState, today: string): number {
  if (!s.lastActiveDay) return 0;
  return s.lastActiveDay >= addDays(today, -1) ? s.streak : 0;
}
