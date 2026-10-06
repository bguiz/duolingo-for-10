import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { User } from '../auth/service';
import { RateLimiter } from '../auth/ratelimit';
import { type Period, utcDay } from '../domain/dates';
import { getLeaderboard } from '../domain/leaderboard';
import { effectiveStreak } from '../domain/scoring';
import { generateCards, insertGeneratedCards } from '../llm/generator';
import type { Deps } from './deps';
import {
  CardPanel, ForgotPage, GenerateResult, HomePage, Layout, LeaderboardPage, LoginPage, MessagePage,
  BoardView, ResetPage, SignupPage, SummaryPanel,
} from './views';

const SESSION_COOKIE = 'sid';
/** A perfect lesson must have been completed this recently to redeem its card-generation reward. */
export const GENERATE_WINDOW_MS = 60 * 60 * 1000;

type Env = { Variables: { user: User | null } };

/** Maximum body size for auth form posts (prevents huge password/email DoS). */
const AUTH_BODY_LIMIT = 4096;

export function createApp(deps: Deps) {
  // Rate limiters: per-IP for broad protection, per-email for targeted account protection.
  // Created inside createApp so each app instance (e.g. in tests) has independent counters.
  const loginIpLimiter = new RateLimiter(10, 15 * 60 * 1000);    // 10 per IP per 15 min
  const loginEmailLimiter = new RateLimiter(5, 15 * 60 * 1000);   // 5 per email per 15 min
  const signupIpLimiter = new RateLimiter(5, 60 * 60 * 1000);     // 5 per IP per hour
  const forgotIpLimiter = new RateLimiter(5, 60 * 60 * 1000);     // 5 per IP per hour
  const forgotEmailLimiter = new RateLimiter(3, 60 * 60 * 1000);  // 3 per email per hour

  const app = new Hono<Env>();
  const secure = deps.baseUrl.startsWith('https://');

  app.use(csrf());
  app.use(async (c, next) => {
    c.set('user', await deps.auth.userForSession(getCookie(c, SESSION_COOKIE)));
    await next();
  });

  const page = (c: any, title: string, body: any, status: 200 | 400 | 401 | 404 | 409 = 200) =>
    c.html(<Layout title={title} user={c.get('user')}>{body}</Layout>, status);
  const requireUser = (c: any): User | null => c.get('user');
  const clientIp = (c: any): string =>
    (c.req.header('x-forwarded-for') ?? 'unknown').split(',')[0].trim();

  const streakFor = async (userId: number) => {
    const s = await deps.db.get<{ streak: number; last_active_day: string | null }>('SELECT streak, last_active_day FROM user_stats WHERE user_id = ?', [userId]);
    return effectiveStreak({ streak: s?.streak ?? 0, lastActiveDay: s?.last_active_day ?? null }, utcDay(deps.now()));
  };

  // ---- public ----
  app.get('/', async (c) => {
    const user = c.get('user');
    const board = await getLeaderboard(deps.db, 'weekly', deps.now(), user?.id);
    return page(c, 'Home', <HomePage user={user} board={board} streak={user ? await streakFor(user.id) : 0} completed={user ? await deps.lessons.completedCount(user.id) : 0} />);
  });

  app.get('/leaderboard', async (c) => {
    const period: Period = c.req.query('period') === 'monthly' ? 'monthly' : 'weekly';
    const board = await getLeaderboard(deps.db, period, deps.now(), c.get('user')?.id);
    if (c.req.header('HX-Request')) return c.html(<BoardView board={board} />);
    return page(c, 'Leaderboard', <LeaderboardPage board={board} />);
  });

  // ---- auth ----
  app.get('/signup', (c) => page(c, 'Sign up', <SignupPage />));
  app.post('/signup', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > AUTH_BODY_LIMIT) return c.text('Request too large.', 413 as any);
    if (!signupIpLimiter.check(clientIp(c))) return page(c, 'Sign up', <SignupPage error="Too many requests. Please wait before trying again." />, 429);
    const b = await c.req.parseBody();
    const r = await deps.auth.signup({ email: String(b.email ?? ''), username: String(b.username ?? ''), password: String(b.password ?? '') });
    return r.ok ? page(c, 'Sign up', <SignupPage done />) : page(c, 'Sign up', <SignupPage error={r.error} />, 400);
  });

  app.get('/verify/:token', async (c) => {
    const ok = await deps.auth.verifyEmail(c.req.param('token'));
    return ok
      ? page(c, 'Verified', <MessagePage title="Email verified" text="You can now log in." linkHref="/login" linkText="Log in" />)
      : page(c, 'Verify', <MessagePage title="Link not valid" text="This verification link is invalid, expired or already used." />, 400);
  });

  app.get('/login', (c) => page(c, 'Log in', <LoginPage />));
  app.post('/login', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > AUTH_BODY_LIMIT) return c.text('Request too large.', 413 as any);
    const ip = clientIp(c);
    if (!loginIpLimiter.check(ip)) return page(c, 'Log in', <LoginPage error="Too many requests. Please wait before trying again." />, 429);
    const b = await c.req.parseBody();
    const email = String(b.email ?? '');
    if (!loginEmailLimiter.check(email.toLowerCase())) return page(c, 'Log in', <LoginPage error="Too many attempts for this account. Please wait before trying again." />, 429);
    const r = await deps.auth.login(email, String(b.password ?? ''));
    if (r === null) return page(c, 'Log in', <LoginPage error="Wrong email or password." />, 401);
    if (r === 'unverified') return page(c, 'Log in', <LoginPage error="Please verify your email first (check your inbox)." />, 401);
    setCookie(c, SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'Lax', secure, path: '/', maxAge: 30 * 86400 });
    return c.redirect('/');
  });
  app.post('/logout', async (c) => {
    await deps.auth.logout(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.redirect('/');
  });

  app.get('/forgot', (c) => page(c, 'Reset password', <ForgotPage />));
  app.post('/forgot', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > AUTH_BODY_LIMIT) return c.text('Request too large.', 413 as any);
    const ip = clientIp(c);
    if (!forgotIpLimiter.check(ip)) return page(c, 'Reset password', <ForgotPage done />); // silent to not leak info
    const b = await c.req.parseBody();
    const email = String(b.email ?? '');
    if (!forgotEmailLimiter.check(email.toLowerCase())) return page(c, 'Reset password', <ForgotPage done />); // silent
    await deps.auth.requestPasswordReset(email);
    return page(c, 'Reset password', <ForgotPage done />);
  });
  app.get('/reset/:token', async (c) => {
    const token = c.req.param('token');
    return (await deps.auth.isTokenValid(token, 'reset'))
      ? page(c, 'Reset password', <ResetPage token={token} />)
      : page(c, 'Reset password', <MessagePage title="Link not valid" text="This reset link is invalid or has expired." linkHref="/forgot" linkText="Request a new one" />, 400);
  });
  app.post('/reset/:token', async (c) => {
    const token = c.req.param('token');
    const b = await c.req.parseBody();
    const r = await deps.auth.resetPassword(token, String(b.password ?? ''));
    return r.ok
      ? page(c, 'Reset password', <MessagePage title="Password updated" text="Log in with your new password." linkHref="/login" linkText="Log in" />)
      : page(c, 'Reset password', <ResetPage token={token} error={r.error} />, 400);
  });

  // ---- lessons (private to the signed-in user) ----
  const lessonView = async (userId: number, lessonId: number, feedback?: { ok: boolean; text: string }) => {
    const lesson = await deps.lessons.get(userId, lessonId);
    if (!lesson) return null;
    if (lesson.completedAt) {
      const score = await deps.lessons.score(lesson);
      const fresh = new Date(lesson.completedAt).getTime() >= deps.now().getTime() - GENERATE_WINDOW_MS;
      return <SummaryPanel lesson={lesson} score={score} streak={await streakFor(userId)} canGenerate={lesson.perfect && !lesson.generationUsedAt && fresh} />;
    }
    const cur = await deps.lessons.current(lesson);
    if (!cur) return null;
    return <CardPanel lessonId={lesson.id} card={cur.card} index={cur.index} total={lesson.cardIds.length} attemptNo={cur.attemptNo} feedback={feedback} />;
  };

  app.post('/lessons', async (c) => {
    const user = requireUser(c);
    if (!user) return c.redirect('/login');
    const lesson = await deps.lessons.start(user.id);
    return c.redirect(`/lessons/${lesson.id}`);
  });

  app.get('/lessons/:id', async (c) => {
    const user = requireUser(c);
    if (!user) return c.redirect('/login');
    const view = await lessonView(user.id, Number(c.req.param('id')));
    return view ? page(c, 'Lesson', view) : page(c, 'Not found', <MessagePage title="Lesson not found" text="That lesson doesn't exist." linkHref="/" linkText="Home" />, 404);
  });

  app.post('/lessons/:id/answer', async (c) => {
    const user = requireUser(c);
    if (!user) return c.text('Please log in.', 401);
    const lessonId = Number(c.req.param('id'));
    const b = await c.req.parseBody();
    const words = String(b.answer ?? '').split('|').filter(Boolean);
    const submittedCardId = b.cardId ? Number(b.cardId) : null;
    const submittedAttemptNo = b.attemptNo ? Number(b.attemptNo) : null;

    const lesson = await deps.lessons.get(user.id, lessonId);
    if (!lesson) return c.text('Lesson not found.', 404);

    // If the lesson is already finished, return the summary instead of an error.
    if (lesson.completedAt) {
      const view = await lessonView(user.id, lessonId);
      return c.req.header('HX-Request') ? c.html(view as any) : page(c, 'Lesson', view);
    }

    const cur = await deps.lessons.current(lesson);
    if (!cur) {
      const view = await lessonView(user.id, lessonId);
      return c.req.header('HX-Request') ? c.html(view as any) : page(c, 'Lesson', view);
    }

    // Reject stale-tab / double-submit mismatches.
    if ((submittedCardId !== null && submittedCardId !== cur.card.id) ||
        (submittedAttemptNo !== null && submittedAttemptNo !== cur.attemptNo)) {
      const view = await lessonView(user.id, lessonId);
      return c.req.header('HX-Request') ? c.html(view as any, 409) : page(c, 'Lesson', view, 409);
    }

    const outcome = await deps.lessons.answer(user.id, lessonId, words);
    if (!outcome) {
      const view = await lessonView(user.id, lessonId);
      return c.req.header('HX-Request') ? c.html(view as any) : page(c, 'Lesson', view);
    }

    const feedback = outcome.kind === 'wrong' ? { ok: false, text: 'Not quite. Try again!' } : { ok: true, text: `Correct! +${outcome.points}` };
    const view = await lessonView(user.id, lessonId, feedback);
    // Plain (non-HTMX) form posts get a full page.
    return c.req.header('HX-Request') ? c.html(view as any) : page(c, 'Lesson', view);
  });

  app.post('/lessons/:id/generate', async (c) => {
    const user = requireUser(c);
    if (!user) return c.text('Please log in.', 401);
    const lessonId = Number(c.req.param('id'));
    const claim = await deps.lessons.claimGeneration(user.id, lessonId, GENERATE_WINDOW_MS);
    if (!claim.ok) {
      const text = {
        404: 'Lesson not found.',
        409: 'You already used the reward for this lesson.',
        403: 'Complete a lesson with a perfect score (no reattempts) to unlock card generation.',
      }[claim.status];
      return c.html(<GenerateResult error text={text} />, claim.status);
    }
    try {
      const result = await generateCards(deps.llm, deps.db);
      const added = await insertGeneratedCards(deps.db, result.accepted, deps.now());
      if (added === 0) await deps.lessons.releaseGeneration(user.id, lessonId); // nothing usable: keep the reward
      return c.html(
        <GenerateResult
          error={added === 0}
          text={added > 0 ? `Added ${added} new card${added === 1 ? '' : 's'} to the pool (${result.rejected.length} rejected by review).` : 'The reviewer rejected every card. Your reward is kept, so try again.'}
        />,
        added > 0 ? 200 : 422,
      );
    } catch (err) {
      console.error('card generation failed:', err);
      await deps.lessons.releaseGeneration(user.id, lessonId);
      return c.html(<GenerateResult error text="Card generation failed. Your reward is kept, so try again." />, 502);
    }
  });

  return app;
}
