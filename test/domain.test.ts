import { addDays, periodStart } from '../src/domain/dates';
import { attemptPoints, effectiveStreak, scoreLesson, streakAfterLesson } from '../src/domain/scoring';
import { nextSrsState, selectLessonCards } from '../src/domain/srs';
import { SEED_CARDS } from '../src/seed/cards';
import { validateCard } from '../src/llm/generator';

const now = new Date('2026-10-07T12:00:00Z'); // a Wednesday

describe('scoring', () => {
  it('awards 10 first try, 2 after a retry, 0 when wrong', () => {
    expect(attemptPoints({ attemptNo: 1, correct: true })).toBe(10);
    expect(attemptPoints({ attemptNo: 2, correct: true })).toBe(2);
    expect(attemptPoints({ attemptNo: 1, correct: false })).toBe(0);
  });

  it('scores on attempts: one miss then a retry is 10/11, not perfect', () => {
    const attempts = [
      ...Array.from({ length: 9 }, (_, i) => ({ cardId: i, attemptNo: 1, correct: true })),
      { cardId: 9, attemptNo: 1, correct: false },
      { cardId: 9, attemptNo: 2, correct: true },
    ];
    expect(scoreLesson(attempts, 10)).toEqual({ points: 92, correctAttempts: 10, totalAttempts: 11, perfect: false });
  });

  it('is perfect only with 10/10 and no reattempts', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({ cardId: i, attemptNo: 1, correct: true }));
    expect(scoreLesson(attempts, 10)).toMatchObject({ points: 100, perfect: true });
  });
});

describe('streaks (UTC, no freezes)', () => {
  it('increments on consecutive days, ignores a second lesson the same day, resets after a gap', () => {
    let s = streakAfterLesson({ streak: 0, lastActiveDay: null }, '2026-10-05');
    s = streakAfterLesson(s, '2026-10-06');
    expect(s.streak).toBe(2);
    expect(streakAfterLesson(s, '2026-10-06')).toEqual(s);
    expect(streakAfterLesson(s, '2026-10-08').streak).toBe(1);
  });

  it('displays 0 once a day has been missed', () => {
    const s = { streak: 5, lastActiveDay: '2026-10-05' };
    expect(effectiveStreak(s, '2026-10-06')).toBe(5);
    expect(effectiveStreak(s, '2026-10-07')).toBe(0);
  });
});

describe('periods', () => {
  it('weekly starts Monday, monthly on the 1st (UTC)', () => {
    expect(periodStart('weekly', now)).toBe('2026-10-05');
    expect(periodStart('monthly', now)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('spaced repetition', () => {
  it('pushes the review further out on success and resets on failure', () => {
    const first = nextSrsState(undefined, true, now);
    expect(first.box).toBe(1);
    expect(first.dueAt).toBe('2026-10-08T12:00:00.000Z');
    const second = nextSrsState(first, true, now);
    expect(second).toMatchObject({ box: 2, dueAt: '2026-10-09T12:00:00.000Z' });
    expect(nextSrsState(second, false, now)).toEqual({ box: 0, dueAt: now.toISOString() });
  });

  it('selects due reviews first (most overdue first), then unseen by difficulty, then not-yet-due', () => {
    const cards = [
      { id: 1, difficulty: 1, progress: { box: 1, dueAt: '2026-10-09T00:00:00Z' } }, // not due
      { id: 2, difficulty: 3 }, // unseen, harder
      { id: 3, difficulty: 1 }, // unseen, easy
      { id: 4, difficulty: 5, progress: { box: 2, dueAt: '2026-10-06T00:00:00Z' } }, // due, most overdue
      { id: 5, difficulty: 2, progress: { box: 1, dueAt: '2026-10-07T00:00:00Z' } }, // due
    ];
    expect(selectLessonCards(cards, now, 5)).toEqual([4, 5, 3, 2, 1]);
    expect(selectLessonCards(cards, now, 2)).toEqual([4, 5]);
  });
});

describe('seed cards', () => {
  it('has 50 valid, unique cards across difficulty levels 1-5', () => {
    expect(SEED_CARDS).toHaveLength(50);
    const taken = new Set<string>();
    for (const c of SEED_CARDS) {
      expect(validateCard(c, taken)).toBeNull();
      taken.add(c.sentence.toLowerCase());
    }
    expect(new Set(SEED_CARDS.map((c) => c.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});
