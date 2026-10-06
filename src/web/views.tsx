import type { Child } from 'hono/jsx';
import type { User } from '../auth/service';
import type { Leaderboard } from '../domain/leaderboard';
import type { Card, Lesson } from '../domain/lessons';
import type { LessonScore } from '../domain/scoring';
import { CLIENT_JS, CSS } from './client';

export const Layout = ({ title, user, children }: { title: string; user: User | null; children?: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · Duolingo for 10</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script src="https://unpkg.com/htmx.org@2.0.4" defer />
    </head>
    <body>
      <header>
        <a class="brand" href="/">🦉 Duolingo for 10</a>
        <nav>
          <a href="/leaderboard">Leaderboard</a>
          {user ? (
            <>
              <span class="muted">{user.username}</span>
              <form method="post" action="/logout">
                <button class="link" type="submit">Log out</button>
              </form>
            </>
          ) : (
            <>
              <a href="/login">Log in</a>
              <a href="/signup">Sign up</a>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <script dangerouslySetInnerHTML={{ __html: CLIENT_JS }} />
    </body>
  </html>
);

const Msg = ({ error, ok }: { error?: string; ok?: string }) => (
  <>
    {error && <p class="err">{error}</p>}
    {ok && <p class="ok">{ok}</p>}
  </>
);

export const SignupPage = ({ error, done }: { error?: string; done?: boolean }) => (
  <div class="card">
    <h1>Create account</h1>
    {done ? (
      <p class="ok">Almost there! If that email can be registered, we've sent a verification link. Check your inbox.</p>
    ) : (
      <form method="post" action="/signup">
        <Msg error={error} />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />
        <label for="username">Username (shown on the leaderboard)</label>
        <input id="username" name="username" type="text" required pattern="[A-Za-z0-9_]{3,20}" />
        <label for="password">Password (8+ characters)</label>
        <input id="password" name="password" type="password" minlength={8} required />
        <p><button type="submit">Sign up</button></p>
      </form>
    )}
  </div>
);

export const LoginPage = ({ error, notice }: { error?: string; notice?: string }) => (
  <div class="card">
    <h1>Log in</h1>
    <form method="post" action="/login">
      <Msg error={error} ok={notice} />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required />
      <p><button type="submit">Log in</button></p>
    </form>
    <p><a href="/forgot">Forgot your password?</a></p>
  </div>
);

export const ForgotPage = ({ done }: { done?: boolean }) => (
  <div class="card">
    <h1>Reset password</h1>
    {done ? (
      <p class="ok">If an account exists for that email, we've sent a reset link.</p>
    ) : (
      <form method="post" action="/forgot">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />
        <p><button type="submit">Send reset link</button></p>
      </form>
    )}
  </div>
);

export const ResetPage = ({ token, error }: { token: string; error?: string }) => (
  <div class="card">
    <h1>Choose a new password</h1>
    <form method="post" action={`/reset/${token}`}>
      <Msg error={error} />
      <label for="password">New password (8+ characters)</label>
      <input id="password" name="password" type="password" minlength={8} required />
      <p><button type="submit">Set password</button></p>
    </form>
  </div>
);

export const MessagePage = ({ title, text, linkHref, linkText }: { title: string; text: string; linkHref?: string; linkText?: string }) => (
  <div class="card">
    <h1>{title}</h1>
    <p>{text}</p>
    {linkHref && <a class="btn" href={linkHref}>{linkText}</a>}
  </div>
);

export const BoardView = ({ board }: { board: Leaderboard }) => {
  const rows = [...board.top];
  const meOutside = board.me && !rows.some((r) => r.userId === board.me!.userId);
  return (
    <div id="board">
      <div class="tabs">
        <a href="/leaderboard?period=weekly" hx-get="/leaderboard?period=weekly" hx-target="#board" hx-swap="outerHTML" class={board.period === 'weekly' ? 'on' : ''}>This week</a>
        <a href="/leaderboard?period=monthly" hx-get="/leaderboard?period=monthly" hx-target="#board" hx-swap="outerHTML" class={board.period === 'monthly' ? 'on' : ''}>This month</a>
      </div>
      <table>
        <thead><tr><th>#</th><th>User</th><th class="n">Points</th><th class="n">Streak</th></tr></thead>
        <tbody>
          {rows.map((r) => <Row r={r} me={board.me?.userId === r.userId} />)}
          {meOutside && (
            <>
              <tr><td colSpan={4} class="muted">…</td></tr>
              <Row r={board.me!} me />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

const Row = ({ r, me }: { r: Leaderboard['top'][number]; me: boolean }) => (
  <tr class={me ? 'me' : ''}>
    <td>{r.rank}</td>
    <td>{r.username}{me ? ' (you)' : ''}</td>
    <td class="n">{r.points}</td>
    <td class="n">{r.streak > 0 ? `🔥 ${r.streak}` : '–'}</td>
  </tr>
);

export const LeaderboardPage = ({ board }: { board: Leaderboard }) => (
  <div class="card">
    <h1>Leaderboard</h1>
    <BoardView board={board} />
  </div>
);

export const HomePage = ({ user, streak, completed, board }: { user: User | null; streak: number; completed: number; board: Leaderboard }) => (
  <>
    <div class="card">
      {user ? (
        <>
          <h1>¡Hola, {user.username}!</h1>
          <div class="stats">
            <div class="stat"><b>🔥 {streak}</b><span class="muted">day streak</span></div>
            <div class="stat"><b>{completed}</b><span class="muted">lessons done</span></div>
          </div>
          <form method="post" action="/lessons"><p><button type="submit">Start a lesson</button></p></form>
        </>
      ) : (
        <>
          <h1>Learn Spanish, one sentence at a time</h1>
          <p>Drag the right words into the blank. Build a streak. Climb the leaderboard.</p>
          <a class="btn" href="/signup">Get started</a> <a href="/login">I already have an account</a>
        </>
      )}
    </div>
    <div class="card">
      <h2>Leaderboard</h2>
      <BoardView board={board} />
    </div>
  </>
);

/** The lesson "panel": swapped in place by HTMX after each answer. */
export const CardPanel = ({ lessonId, card, index, total, feedback }: { lessonId: number; card: Card; index: number; total: number; feedback?: { ok: boolean; text: string } }) => {
  const [before, after] = card.sentence.split('___');
  const bank = [...card.bank].sort(() => Math.random() - 0.5);
  return (
    <div id="panel" class="card">
      <div class="progress"><div style={`width:${(index / total) * 100}%`} /></div>
      <p class="muted">Card {index + 1} of {total} · Fill in the blank</p>
      {feedback && <p class={feedback.ok ? 'ok' : 'err'}>{feedback.text}</p>}
      <div class="sentence">
        <span>{before}</span>
        <span id="slot" class="empty" />
        <span>{after}</span>
      </div>
      <p class="muted">{card.translation}</p>
      <div id="bank">
        {bank.map((w) => <span class="chip" role="button" tabindex={0} draggable="true" data-word={w}>{w}</span>)}
      </div>
      <form hx-post={`/lessons/${lessonId}/answer`} hx-target="#panel" hx-swap="outerHTML" method="post" action={`/lessons/${lessonId}/answer`}>
        <input type="hidden" id="answer" name="answer" value="" />
        <button id="check" type="submit" disabled>Check</button>
      </form>
    </div>
  );
};

export const SummaryPanel = ({ lesson, score, streak, canGenerate }: { lesson: Lesson; score: LessonScore; streak: number; canGenerate: boolean }) => (
  <div id="panel" class="card">
    <h1>{score.perfect ? 'Perfect lesson! 🎉' : 'Lesson complete!'}</h1>
    <div class="stats">
      <div class="stat"><b>{score.correctAttempts}/{score.totalAttempts}</b><span class="muted">correct / attempts</span></div>
      <div class="stat"><b>+{score.points}</b><span class="muted">points</span></div>
      <div class="stat"><b>🔥 {streak}</b><span class="muted">day streak</span></div>
    </div>
    {canGenerate && (
      <div id="generate-box">
        <p>Perfect score! Reward: have the AI write brand-new cards for everyone's pool.</p>
        <button hx-post={`/lessons/${lesson.id}/generate`} hx-target="#generate-box" hx-swap="outerHTML" hx-disabled-elt="this">Generate new cards</button>
      </div>
    )}
    <p>
      <form method="post" action="/lessons" style="display:inline"><button type="submit">Next lesson</button></form>{' '}
      <a href="/leaderboard">See leaderboard</a>
    </p>
  </div>
);

export const GenerateResult = ({ text, error }: { text: string; error?: boolean }) => (
  <div id="generate-box">
    <p class={error ? 'err' : 'ok'}>{text}</p>
  </div>
);
