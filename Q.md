# Q&A — Mini Duolingo

## Round 1

**Q1. What should the one main entity be?**
A: Flashcard / vocab word.

**Q2. What is the one shared action?**
A: Add to leaderboard / streak (practising updates a shared ranking).

**Q3. What is the one access rule about who can view or change data?**
A: Points and streaks are visible to everyone (public). Which lessons are completed is private to the user.

## Round 2

**Q4. Who authors the flashcards?**
A: Start with a seeded set. Users can press a button to generate more cards using an LLM, as a reward for completing a lesson with a perfect score.

**Q5. How does login work?**
A: Email + password.

**Q6. What tech stack?**
A: SQLite locally, with a view to swapping to Cloudflare D1 for deployment (serverless SQL on SQLite, for Cloudflare Workers).

## Round 3

**Q7. Language pair and exercise format?**
A: Users know English and are learning Spanish. Exercise: a Spanish sentence with a missing word/phrase, and 4–8 words underneath. The user drags and drops words into the blank(s), in the correct order, to make a sensible Spanish sentence.

**Q8. What is a lesson, and how are points/streaks earned?**
A: Lesson = 10 cards; 10 points per correct answer; daily streak (one lesson per day increments it). A perfect score (10/10) unlocks the LLM card-generation button.

**Q9. Are LLM-generated cards private or global?**
A: Added to the global pool (everyone benefits).

---

## Confidence check
~85% sure of the shape. Summary so far:
- Entity: `Card` (Spanish sentence with blank(s), correct word order, 4–8 word bank, English hint?)
- Shared action: finishing a lesson updates points + streak on a public leaderboard
- Rule: points/streak public to all logged-in users (or everyone?); lesson completion history private to each user
- Auth: email + password; SQLite locally → Cloudflare D1
- Bonus: perfect lesson → button to LLM-generate new cards into the global pool

Noted tension: global LLM cards means any user can write to the shared Card table. This is fine, but it's a second "who can change data" path beyond the one rule. Treat as a system-level insert (server-only, users can't edit/delete cards) — see Q13.

## Remaining questions (not yet asked)

**Q10. Frontend/runtime:** Which framework should run on Cloudflare Workers (e.g. Hono + plain HTML/JS, Next.js via OpenNext, SvelteKit, Remix)? Any preference?

HTMX

**Q11. Drag-and-drop:** Desktop mouse only, or must it work on touch/mobile? Library (e.g. dnd-kit, SortableJS) or hand-rolled HTML5 DnD? Tap-to-place fallback for accessibility?

Tap to place fallback
Assume desktop only

**Q12. Leaderboard visibility:** Visible to logged-out visitors too, or only to logged-in users? Show email or a chosen display name/username?

Public visibility (no need to authN/authZ)

**Q13. Card moderation:** Should LLM-generated cards be validated (e.g. sentence ends with correct answer, no duplicates, no offensive content) before joining the global pool? Can users report/delete bad cards?

Use 1 LLM call to generate a batch of new questions, and another LLM call (separate context window) to review/ check - this checker LLM has the right to reject.

**Q14. LLM provider and limits:** Which LLM (Claude via API?) and how many cards per button press (e.g. 10)? Rate limit per user? Where does the API key live (Worker secret)?

Rate limit is inherent based on the user action required to activate it (recall that they need to complete a lesson with a perfect score), so the generate endpoint should return 4xx if an authZ'ed user attempts to call this without having just completed a perfect lesson.

API key will be using opencode go as the inference provider.
For local development use a .env file to store this.
For (later) cloudflare deploymment, assume that the env vars will be injected from cloudflare Centralized Secrets Store.

**Q15. Card selection:** How are the 10 cards chosen for a lesson — random, never-seen-first, or weighted toward previously missed? Can the same card repeat on the same day?

Use a spaced repetition system, e.g. the original system by Ebbinghaus

**Q16. Wrong answers:** Does a lesson allow retries or show the correct answer and move on? Are points lost or just not awarded?

Retries allowed, but the total score is computed upon attempts. So a user that gets one questions wrong, then reattampts, and gets it right will be scored 10/11 (instead of 9/10)

**Q17. Streak rules:** What defines a "day" (user timezone vs UTC)? Does a missed day reset to 0? Any freeze mechanic?

No streak freezes.
UTC.

**Q18. Leaderboard shape:** All-time points, weekly points, or both? Top N shown, and does the user's own rank always show?

Weekly and monthly.
Always show rank.

**Q19. Perfect-score reward:** Is generation one-time per perfect lesson (earned token) or can the button be pressed repeatedly until the page is left?

One time per perfect lesson only.

**Q20. Seed size and content:** How many seed cards (e.g. 50–100), and who writes them — me (Claude), you, or imported from a dataset? Difficulty levels/ordering?

50 seed cards.
Each card should have metadata, including difficulty level.
By default, users see them in dificulty order.

**Q21. Scope extras:** Any explicit non-goals (audio, hearts/lives, multiple languages, profile pages, password reset, email verification)?

Sign up and password resets via email verification.

**Q22. Deliverable bar:** Local demo only, or deployed to Cloudflare as part of this exercise? Tests expected?

Local demo only now.

Add minimal unit tests for now, using Jest.
