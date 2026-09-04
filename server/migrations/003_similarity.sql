-- Phase 3 — "find planets like this one": a k-nearest-neighbour index over the catalog.
--
-- Design notes:
--   * The roadmap assumed pgvector. It is not in `postgres:17-alpine`, and moving to
--     `pgvector/pgvector:pg17` would mean a different base image and a re-initialised
--     data volume for the sake of four dimensions. Postgres ships `cube` in contrib, it
--     is already available in the image we run, and it has exactly the GiST k-NN
--     operator this needs (`<->`, Euclidean). pgvector earns its keep at 768 dimensions
--     with HNSW; at four it would be ceremony.
--   * The vectors live in their own table rather than as a column on `planets`. A `cube`
--     is a contrib type with no asyncpg codec, so a `SELECT *` over `planets` would stop
--     decoding the moment such a column existed — and every endpoint that reads a whole
--     planet row does exactly that. Keeping it separate also says the true thing: this
--     is an index structure derived from the row, not a property of the planet.
--   * A planet with too little measured to rank simply has no row here, so "not in the
--     table" and "cannot be ranked" are the same fact rather than two that can disagree.
--   * The vector is stored already standardised, so the distance operator compares
--     radius against stellar temperature without one of them drowning out the other. The
--     scaling constants live in `feature_stats`, per ingest run, so a stored vector can
--     always be traced back to the population it was normalised against.
--   * `feature_mask` records which dimensions were actually *measured*. A missing one is
--     imputed to the population mean, which is the neutral choice — it drags a match
--     neither closer nor further — but the API has to be able to say so rather than
--     presenting an imputed number as an observation.

CREATE EXTENSION IF NOT EXISTS cube;

CREATE TABLE IF NOT EXISTS planet_features (
    planet_id    TEXT     PRIMARY KEY REFERENCES planets (id) ON DELETE CASCADE,
    feature_vec  cube     NOT NULL,
    feature_mask SMALLINT NOT NULL,
    run_id       BIGINT   NOT NULL REFERENCES ingest_runs (id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GiST is what makes `ORDER BY feature_vec <-> $1 LIMIT 8` an index scan straight to the
-- nearest rows, instead of a distance for all ~6,300 and a sort.
CREATE INDEX IF NOT EXISTS planet_features_vec_idx
    ON planet_features USING gist (feature_vec);

CREATE TABLE IF NOT EXISTS feature_stats (
    run_id         BIGINT   NOT NULL REFERENCES ingest_runs (id) ON DELETE CASCADE,
    -- Position in the cube, 0-based. The name is stored alongside so a stats row is
    -- readable on its own and a reordered feature list cannot silently mislabel one.
    dimension      SMALLINT NOT NULL,
    feature        TEXT     NOT NULL,
    -- Mean and standard deviation of the *transformed* value (log10 for the quantities
    -- that span orders of magnitude), over the rows where it was measured.
    mean           DOUBLE PRECISION NOT NULL,
    stddev         DOUBLE PRECISION NOT NULL,
    measured_count INTEGER  NOT NULL,
    PRIMARY KEY (run_id, dimension)
);
