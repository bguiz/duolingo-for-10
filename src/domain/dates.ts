/** All "days" are UTC calendar days, formatted YYYY-MM-DD. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDay(d);
}

export type Period = 'weekly' | 'monthly';

/** First day (inclusive) of the current UTC week (Monday) or month. */
export function periodStart(period: Period, now: Date): string {
  const day = utcDay(now);
  if (period === 'monthly') return `${day.slice(0, 8)}01`;
  const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}
