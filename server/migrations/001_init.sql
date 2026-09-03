-- Exoplanet Explorer — initial schema.
--
-- Design notes:
--   * `planets` holds the CURRENT catalog, with NASA's raw columns and our derived
--     columns side by side. Derived values are computed once during ingest instead of
--     in every visitor's browser.
--   * `ingest_runs` is an audit trail. Every ingest writes a row, so a failed nightly
--     job is visible rather than silent.
--   * `planet_history` is append-only. It records a row whenever a value we care about
--     actually changes between runs, which is what makes the Phase 3 "time machine"
--     possible. NASA's TAP API only ever serves the present, so if we do not keep this
--     ourselves, the history is gone forever.

CREATE TABLE IF NOT EXISTS ingest_runs (
    id            BIGSERIAL PRIMARY KEY,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    status        TEXT        NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    source        TEXT        NOT NULL DEFAULT 'nasa_tap',
    rows_fetched  INTEGER,
    rows_upserted INTEGER,
    rows_changed  INTEGER,
    duration_ms   INTEGER,
    error         TEXT
);

CREATE INDEX IF NOT EXISTS ingest_runs_started_idx ON ingest_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS planets (
    id                 TEXT PRIMARY KEY,
    pl_name            TEXT NOT NULL UNIQUE,
    hostname           TEXT NOT NULL,

    -- Raw NASA columns (pscomppars). All nullable: the archive is genuinely incomplete.
    sy_dist            DOUBLE PRECISION,
    pl_rade            DOUBLE PRECISION,
    pl_bmasse          DOUBLE PRECISION,
    pl_eqt             DOUBLE PRECISION,
    pl_orbper          DOUBLE PRECISION,
    pl_orbsmax         DOUBLE PRECISION,
    discoverymethod    TEXT,
    disc_year          INTEGER,
    disc_telescope     TEXT,
    st_teff            DOUBLE PRECISION,
    st_rad             DOUBLE PRECISION,
    st_spectype        TEXT,
    ra                 DOUBLE PRECISION,
    dec                DOUBLE PRECISION,

    -- Derived during ingest.
    distance_ly        DOUBLE PRECISION,
    insolation         DOUBLE PRECISION,
    habitability_score SMALLINT NOT NULL DEFAULT 0,
    is_habitable       BOOLEAN  NOT NULL DEFAULT FALSE,
    size_category      TEXT     NOT NULL,
    pos_x              REAL     NOT NULL,
    pos_y              REAL     NOT NULL,
    pos_z              REAL     NOT NULL,
    color_r            SMALLINT NOT NULL,
    color_g            SMALLINT NOT NULL,
    color_b            SMALLINT NOT NULL,
    visual_radius      REAL     NOT NULL,

    -- The Solar System rows are seeded by us, not fetched from NASA. Flagged so an
    -- ingest never deletes them and the UI can treat them as the reference frame.
    is_solar_system    BOOLEAN NOT NULL DEFAULT FALSE,

    first_seen_run     BIGINT REFERENCES ingest_runs (id),
    last_seen_run      BIGINT REFERENCES ingest_runs (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ordering the catalog by distance keeps the binary payload's implicit index stable
-- and makes "nearest N systems" queries an index scan.
CREATE INDEX IF NOT EXISTS planets_distance_idx    ON planets (distance_ly);
CREATE INDEX IF NOT EXISTS planets_hostname_idx    ON planets (hostname);
CREATE INDEX IF NOT EXISTS planets_disc_year_idx   ON planets (disc_year);
CREATE INDEX IF NOT EXISTS planets_habitable_idx   ON planets (habitability_score DESC);
CREATE INDEX IF NOT EXISTS planets_method_idx      ON planets (discoverymethod);

CREATE TABLE IF NOT EXISTS planet_history (
    id         BIGSERIAL PRIMARY KEY,
    planet_id  TEXT   NOT NULL REFERENCES planets (id) ON DELETE CASCADE,
    run_id     BIGINT NOT NULL REFERENCES ingest_runs (id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Snapshot of the tracked fields as they were BEFORE this run overwrote them.
    previous   JSONB  NOT NULL
);

CREATE INDEX IF NOT EXISTS planet_history_planet_idx ON planet_history (planet_id, changed_at DESC);
