CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  url TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (interval_minutes BETWEEN 1 AND 1440),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  last_status TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status_code INTEGER,
  response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
  is_online BOOLEAN NOT NULL,
  ssl_days_left INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checks_monitor_checked_at_idx
  ON checks (monitor_id, checked_at DESC);
