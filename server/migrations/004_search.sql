-- Phase 3 — search that survives the way people actually type a planet name.
--
-- Design notes:
--   * The client already holds all ~6,300 names, so a plain substring filter is not what
--     this is for. What the browser cannot do is forgive the input: "kepler 452b",
--     "KEPLER-452 B" and "keplr-452 b" are the same intent, and only the first of those
--     matches `pl_name.includes(q)`.
--   * Punctuation is the first half of the problem and it is not fuzzy at all — it is
--     deterministic. Both sides are folded to lowercase alphanumerics ("Kepler-452 b" ->
--     "kepler452b") in generated columns, so spacing and hyphens stop mattering before
--     similarity is ever consulted. Generated rather than filled by ingest: the value is
--     a function of the name, and a column Postgres maintains cannot drift out of sync
--     with the row the way one written by application code eventually does.
--   * The second half is genuine typos, which is what `pg_trgm` is for. It is in
--     `postgres:17-alpine` already (checked with `pg_available_extensions`, same as
--     `cube` in 003), so this costs an extension and two indexes, not a new image.
--   * GIN over trigrams serves both the `%` similarity operator and `LIKE '%...%'`, so
--     the literal-substring path and the fuzzy path use one index apiece rather than a
--     sequential scan for the literal one.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE planets
    ADD COLUMN IF NOT EXISTS name_key TEXT
        GENERATED ALWAYS AS (lower(regexp_replace(pl_name,  '[^a-zA-Z0-9]+', '', 'g'))) STORED,
    ADD COLUMN IF NOT EXISTS host_key TEXT
        GENERATED ALWAYS AS (lower(regexp_replace(hostname, '[^a-zA-Z0-9]+', '', 'g'))) STORED;

CREATE INDEX IF NOT EXISTS planets_name_key_trgm ON planets USING gin (name_key gin_trgm_ops);
CREATE INDEX IF NOT EXISTS planets_host_key_trgm ON planets USING gin (host_key gin_trgm_ops);
