-- D1 schema for the `attention-pings` Worker. One row per scheduled ping; the answer is stored on
-- the same row. Answers are categories and a 0 to 100 mood score only: there is no free-text column.
CREATE TABLE IF NOT EXISTS pings (
  id           TEXT PRIMARY KEY,               -- random, 16 hex characters
  day          TEXT NOT NULL,                  -- local date, YYYY-MM-DD
  scheduled_at TEXT NOT NULL,                  -- ISO 8601, UTC
  send_status  TEXT NOT NULL DEFAULT 'pending' -- pending | sent | failed | skipped
    CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at      TEXT,
  answered_at  TEXT,
  activity     TEXT,
  on_task      INTEGER CHECK (on_task IN (0, 1)),
  time_focus   TEXT CHECK (time_focus IN ('past', 'present', 'future')),
  project      TEXT,
  mood         INTEGER CHECK (mood BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS pings_day ON pings (day);
CREATE INDEX IF NOT EXISTS pings_pending ON pings (send_status, scheduled_at);
