-- Phase 3 — permalinks: a view of the map that survives being pasted into a chat.
--
-- Design notes:
--   * The slug is derived from the state, not drawn at random. Sharing the same view
--     twice produces the same link and the same row, so a visitor dragging a slider back
--     and forth cannot fill the table with near-duplicates. See `app/share.py` for the
--     canonical form the hash is taken over.
--   * The state could have lived entirely in the URL fragment, with no server and no
--     table at all. It does not, for two reasons: a fragment is never sent to the server,
--     so no crawler could ever render a preview card for the link; and a full filter set
--     encoded inline makes a URL that chat clients truncate. What the visitor copies is
--     ten characters.
--   * `focus_planet_id` is generated from the state rather than written alongside it. It
--     is a function of the row — the same argument as `name_key` in 004 — so it cannot
--     drift, and the preview-image route can find the planet without parsing JSON. It
--     carries no foreign key on purpose: the reference is validated when the link is
--     created, and a link already in circulation should not be deleted by a schema
--     cascade it never asked for.
--   * `created_by` is nullable and set to NULL when the account goes away. A link is
--     held by whoever it was sent to; deleting the person who made it should not break
--     it for them.
--   * `last_viewed_at` exists so links nobody ever opens can eventually be swept. It is
--     written on read, which is the one thing this table does that a cache would not
--     like — see the note on the GET handler.

CREATE TABLE IF NOT EXISTS shared_views (
    slug            TEXT        PRIMARY KEY,
    state           JSONB       NOT NULL,
    focus_planet_id TEXT        GENERATED ALWAYS AS (state ->> 'focus') STORED,
    created_by      BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_viewed_at  TIMESTAMPTZ,
    view_count      INTEGER     NOT NULL DEFAULT 0
);

-- Partial: most links pin a planet, but the ones that do not should not be indexed under
-- a NULL that no query ever asks for.
CREATE INDEX IF NOT EXISTS shared_views_focus_idx
    ON shared_views (focus_planet_id) WHERE focus_planet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shared_views_creator_idx
    ON shared_views (created_by, created_at DESC) WHERE created_by IS NOT NULL;

-- The sweep for links that were made and never opened again.
CREATE INDEX IF NOT EXISTS shared_views_last_viewed_idx ON shared_views (last_viewed_at);
