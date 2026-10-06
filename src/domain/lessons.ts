import type { Db } from '../db/types';
import { utcDay } from './dates';
import { type CandidateCard, LESSON_SIZE, nextSrsState, selectLessonCards } from './srs';
import { type Attempt, type LessonScore, type StreakState, scoreLesson, streakAfterLesson } from './scoring';

export interface Card {
  id: number;
  sentence: string;
  answer: string[];
  bank: string[];
  translation: string;
  difficulty: number;
}

interface CardRow extends Omit<Card, 'answer' | 'bank'> {
  answer: string;
  bank: string;
}

const toCard = (r: CardRow): Card => ({ ...r, answer: JSON.parse(r.answer), bank: JSON.parse(r.bank) });

export interface Lesson {
  id: number;
  userId: number;
  cardIds: number[];
  completedAt: string | null;
  points: number;
  perfect: boolean;
  generationUsedAt: string | null;
}

interface LessonRow {
  id: number;
  user_id: number;
  card_ids: string;
  completed_at: string | null;
  points: number;
  perfect: number;
  generation_used_at: string | null;
}

const toLesson = (r: LessonRow): Lesson => ({
  id: r.id,
  userId: r.user_id,
  cardIds: JSON.parse(r.card_ids),
  completedAt: r.completed_at,
  points: r.points,
  perfect: !!r.perfect,
  generationUsedAt: r.generation_used_at,
});

export type AnswerOutcome =
  | { kind: 'correct'; points: number; done: false }
  | { kind: 'correct'; points: number; done: true; score: LessonScore }
  | { kind: 'wrong' };

/**
 * Lessons, attempts and SRS progress are PRIVATE to a user: every query here is scoped by user id,
 * so another user's lesson is indistinguishable from one that does not exist.
 */
export class LessonService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(userId: number): Promise<Lesson> {
    const rows = await this.db.all<{ id: number; difficulty: number; box: number | null; due_at: string | null }>(
      `SELECT c.id, c.difficulty, p.box, p.due_at FROM cards c
       LEFT JOIN card_progress p ON p.card_id = c.id AND p.user_id = ?`,
      [userId],
    );
    const candidates: CandidateCard[] = rows.map((r) => ({
      id: r.id,
      difficulty: r.difficulty,
      progress: r.box === null ? undefined : { box: r.box, dueAt: r.due_at! },
    }));
    const cardIds = selectLessonCards(candidates, this.now(), LESSON_SIZE);
    if (cardIds.length === 0) throw new Error('No cards available');
    const r = await this.db.run('INSERT INTO lessons (user_id, card_ids, created_at) VALUES (?, ?, ?)', [
      userId,
      JSON.stringify(cardIds),
      this.now().toISOString(),
    ]);
    return (await this.get(userId, r.lastId))!;
  }

  async get(userId: number, lessonId: number): Promise<Lesson | null> {
    const row = await this.db.get<LessonRow>('SELECT * FROM lessons WHERE id = ? AND user_id = ?', [lessonId, userId]);
    return row ? toLesson(row) : null;
  }

  async attempts(lessonId: number): Promise<Attempt[]> {
    const rows = await this.db.all<{ card_id: number; attempt_no: number; correct: number }>(
      'SELECT card_id, attempt_no, correct FROM lesson_attempts WHERE lesson_id = ? ORDER BY id',
      [lessonId],
    );
    return rows.map((r) => ({ cardId: r.card_id, attemptNo: r.attempt_no, correct: !!r.correct }));
  }

  /** The card the user should answer next (first not yet answered correctly), plus progress. */
  async current(lesson: Lesson): Promise<{ card: Card; index: number; attemptNo: number } | null> {
    const attempts = await this.attempts(lesson.id);
    const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.cardId));
    const index = lesson.cardIds.findIndex((id) => !solved.has(id));
    if (index < 0) return null;
    const cardId = lesson.cardIds[index];
    const row = await this.db.get<CardRow>('SELECT * FROM cards WHERE id = ?', [cardId]);
    if (!row) return null;
    return { card: toCard(row), index, attemptNo: attempts.filter((a) => a.cardId === cardId).length + 1 };
  }

  async score(lesson: Lesson): Promise<LessonScore> {
    return scoreLesson(await this.attempts(lesson.id), lesson.cardIds.length);
  }

  async answer(userId: number, lessonId: number, words: string[]): Promise<AnswerOutcome | null> {
    const lesson = await this.get(userId, lessonId);
    if (!lesson || lesson.completedAt) return null;
    const cur = await this.current(lesson);
    if (!cur) return null;

    const correct = JSON.stringify(words) === JSON.stringify(cur.card.answer);
    const now = this.now();
    await this.db.run(
      'INSERT INTO lesson_attempts (lesson_id, card_id, attempt_no, answer, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [lesson.id, cur.card.id, cur.attemptNo, JSON.stringify(words), correct ? 1 : 0, now.toISOString()],
    );
    if (!correct) return { kind: 'wrong' };

    const points = cur.attemptNo === 1 ? 10 : 2;
    if (cur.index < lesson.cardIds.length - 1) return { kind: 'correct', points, done: false };
    return { kind: 'correct', points, done: true, score: await this.complete(lesson) };
  }

  /** Finalises a lesson once: stores the score, updates SRS, public points and streak. */
  private async complete(lesson: Lesson): Promise<LessonScore> {
    const score = await this.score(lesson);
    const now = this.now();
    const claimed = await this.db.run('UPDATE lessons SET completed_at = ?, points = ?, perfect = ? WHERE id = ? AND completed_at IS NULL', [
      now.toISOString(),
      score.points,
      score.perfect ? 1 : 0,
      lesson.id,
    ]);
    if (claimed.changes !== 1) return score; // already completed elsewhere

    const attempts = await this.attempts(lesson.id);
    for (const cardId of lesson.cardIds) {
      const firstTry = attempts.find((a) => a.cardId === cardId && a.attemptNo === 1)?.correct ?? false;
      const prev = await this.db.get<{ box: number; due_at: string }>('SELECT box, due_at FROM card_progress WHERE user_id = ? AND card_id = ?', [lesson.userId, cardId]);
      const next = nextSrsState(prev ? { box: prev.box, dueAt: prev.due_at } : undefined, firstTry, now);
      await this.db.run(
        `INSERT INTO card_progress (user_id, card_id, box, due_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET box = excluded.box, due_at = excluded.due_at`,
        [lesson.userId, cardId, next.box, next.dueAt],
      );
    }

    const day = utcDay(now);
    if (score.points > 0) await this.db.run('INSERT INTO score_events (user_id, points, day) VALUES (?, ?, ?)', [lesson.userId, score.points, day]);
    const stats = await this.db.get<{ streak: number; last_active_day: string | null }>('SELECT streak, last_active_day FROM user_stats WHERE user_id = ?', [lesson.userId]);
    const prevStreak: StreakState = { streak: stats?.streak ?? 0, lastActiveDay: stats?.last_active_day ?? null };
    const nextStreak = streakAfterLesson(prevStreak, day);
    await this.db.run(
      `INSERT INTO user_stats (user_id, streak, last_active_day) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET streak = excluded.streak, last_active_day = excluded.last_active_day`,
      [lesson.userId, nextStreak.streak, nextStreak.lastActiveDay],
    );
    return score;
  }

  async completedCount(userId: number): Promise<number> {
    const r = await this.db.get<{ n: number }>('SELECT COUNT(*) n FROM lessons WHERE user_id = ? AND completed_at IS NOT NULL', [userId]);
    return r?.n ?? 0;
  }

  /**
   * Claims the one-time card-generation reward for a lesson. Succeeds only for the owner's
   * completed, perfect lesson finished within `windowMs`, and only once.
   */
  async claimGeneration(userId: number, lessonId: number, windowMs: number): Promise<{ ok: true } | { ok: false; status: 403 | 404 | 409 }> {
    const now = this.now();
    const claimed = await this.db.run(
      `UPDATE lessons SET generation_used_at = ?
       WHERE id = ? AND user_id = ? AND perfect = 1 AND completed_at IS NOT NULL AND completed_at >= ? AND generation_used_at IS NULL`,
      [now.toISOString(), lessonId, userId, new Date(now.getTime() - windowMs).toISOString()],
    );
    if (claimed.changes === 1) return { ok: true };
    const lesson = await this.get(userId, lessonId);
    if (!lesson) return { ok: false, status: 404 };
    if (lesson.generationUsedAt) return { ok: false, status: 409 };
    return { ok: false, status: 403 };
  }

  async releaseGeneration(userId: number, lessonId: number): Promise<void> {
    await this.db.run('UPDATE lessons SET generation_used_at = NULL WHERE id = ? AND user_id = ?', [lessonId, userId]);
  }
}
