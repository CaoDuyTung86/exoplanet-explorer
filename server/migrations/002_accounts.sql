-- Phase 3 — accounts, and the things an account is for.
--
-- Design notes:
--   * Sessions are opaque random tokens, not JWTs. Only the SHA-256 of the token is
--     stored, so a database leak does not hand out live sessions, and DELETE on a row
--     revokes access immediately. A JWT cannot be revoked without a denylist, which is
--     the same table with extra steps.
--   * `bookmarks.planet_id` references `planets` because ingest only ever upserts, never
--     deletes. A saved planet therefore cannot dangle.
--   * `saved_filters.filters` is JSONB rather than 10 typed columns: the filter shape is
--     the client's business and it changes whenever a slider is added. The server only
--     stores and returns it.

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    -- Stored already lower-cased and trimmed by the application, so a plain UNIQUE is
    -- enough and no citext extension is needed.
    email         TEXT        NOT NULL UNIQUE,
    display_name  TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash   TEXT        PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions (user_id);
-- Lets the expiry sweep be an index scan instead of a seq scan over every session.
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    BIGINT      NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
    planet_id  TEXT        NOT NULL REFERENCES planets (id) ON DELETE CASCADE,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, planet_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_created_idx ON bookmarks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_filters (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    filters    JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Saving under a name that already exists overwrites it, which is what "Save" means
    -- to a user. The constraint is what makes that an ON CONFLICT instead of a race.
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS saved_filters_user_idx ON saved_filters (user_id, updated_at DESC);
