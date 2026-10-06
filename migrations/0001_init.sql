-- D1-compatible (plain SQLite). Timestamps are ISO-8601 UTC strings, days are 'YYYY-MM-DD' (UTC).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  verified_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- one-time email tokens: kind = 'verify' | 'reset'
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- The main entity. `sentence` contains exactly one '___' blank; `answer` is the ordered
-- JSON array of words that fill it; `bank` is the JSON array of all offered words (answer + distractors).
CREATE TABLE cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sentence    TEXT NOT NULL UNIQUE,
  answer      TEXT NOT NULL,
  bank        TEXT NOT NULL,
  translation TEXT NOT NULL,
  difficulty  INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  source      TEXT NOT NULL DEFAULT 'seed',  -- 'seed' | 'llm'
  created_at  TEXT NOT NULL
);

-- PRIVATE: per-user spaced-repetition state.
CREATE TABLE card_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  box     INTEGER NOT NULL,
  due_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- PRIVATE: which lessons a user has completed, and how.
CREATE TABLE lessons (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_ids           TEXT NOT NULL,       -- JSON array, in play order
  created_at         TEXT NOT NULL,
  completed_at       TEXT,
  points             INTEGER NOT NULL DEFAULT 0,
  perfect            INTEGER NOT NULL DEFAULT 0,
  generation_used_at TEXT
);
CREATE INDEX lessons_user ON lessons(user_id);

CREATE TABLE lesson_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  card_id    INTEGER NOT NULL,
  attempt_no INTEGER NOT NULL,
  answer     TEXT NOT NULL,
  correct    INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX attempts_lesson ON lesson_attempts(lesson_id);

-- PUBLIC: what the leaderboard reads. Deliberately has no lesson/card reference.
CREATE TABLE score_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points  INTEGER NOT NULL,
  day     TEXT NOT NULL
);
CREATE INDEX score_day ON score_events(day);

-- PUBLIC: streak state.
CREATE TABLE user_stats (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak          INTEGER NOT NULL DEFAULT 0,
  last_active_day TEXT
);
