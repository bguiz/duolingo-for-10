import type { Db } from '../db/types';
import { type Period, periodStart, utcDay } from './dates';
import { effectiveStreak } from './scoring';

export interface LeaderboardRow {
  rank: number;
  userId: number;
  username: string;
  points: number;
  streak: number;
}

export interface Leaderboard {
  period: Period;
  top: LeaderboardRow[];
  /** The viewer's own row, always present when a viewer is given (even if outside the top). */
  me?: LeaderboardRow;
}

export const TOP_N = 10;

/**
 * PUBLIC data: only usernames, points and streaks. Reads score_events/user_stats only,
 * never lessons or card progress.
 */
export async function getLeaderboard(db: Db, period: Period, now: Date, viewerId?: number): Promise<Leaderboard> {
  const rows = await db.all<{ id: number; username: string; points: number; streak: number; last_active_day: string | null }>(
    `SELECT u.id, u.username, COALESCE(SUM(e.points), 0) AS points,
            COALESCE(s.streak, 0) AS streak, s.last_active_day
     FROM users u
     LEFT JOIN score_events e ON e.user_id = u.id AND e.day >= ?
     LEFT JOIN user_stats s ON s.user_id = u.id
     WHERE u.verified_at IS NOT NULL
     GROUP BY u.id`,
    [periodStart(period, now)],
  );
  const today = utcDay(now);
  const sorted = rows
    .map((r) => ({
      userId: r.id,
      username: r.username,
      points: r.points,
      streak: effectiveStreak({ streak: r.streak, lastActiveDay: r.last_active_day }, today),
    }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));

  // Competition ranking: equal points share a rank.
  const ranked: LeaderboardRow[] = sorted.map((r, i) => ({
    ...r,
    rank: i > 0 && sorted[i - 1].points === r.points ? 0 : i + 1,
  }));
  ranked.forEach((r, i) => {
    if (r.rank === 0) r.rank = ranked[i - 1].rank;
  });

  return { period, top: ranked.slice(0, TOP_N), me: viewerId === undefined ? undefined : ranked.find((r) => r.userId === viewerId) };
}
