# Duolingo for 10

Mini Duolingo: fill the blank in a Spanish sentence by dragging (or tapping) words, build a UTC-day streak, climb a public weekly/monthly leaderboard.

```
cp .env.example .env   # set OPENCODE_GO_API_KEY and OPENCODE_GO_MODEL for card generation
npm install
npm run dev            # http://localhost:3000
npm test
```

Verification and password-reset emails are printed to the server console (`ConsoleMailer`).

## Design
- **Entity:** `cards` (50 seeded, difficulty 1-5). **Shared action:** finishing a lesson adds points + streak to the public leaderboard.
- **Access rule:** points/streaks (`score_events`, `user_stats`) are public; lessons, attempts and SRS progress are private and every query is scoped by user id.
- **Scoring:** 10 pts right first try, 2 right after a retry, 0 wrong. Score is correct/attempts; "perfect" = 10/10 with no reattempts.
- **SRS:** Ebbinghaus-style boxes (1,2,4,7,15,30 days). Lessons take due reviews first, then unseen cards easiest-first.
- **Reward:** a perfect lesson can trigger one generation (`POST /lessons/:id/generate`, 4xx otherwise, within 1 hour). One LLM call writes 10 cards, a second, separate call reviews them and can reject.
- **Swappable edges:** `Db` (better-sqlite3 now, `fromD1` for Cloudflare D1), `Mailer` (console now, Cloudflare Email Service later), secrets from env.
