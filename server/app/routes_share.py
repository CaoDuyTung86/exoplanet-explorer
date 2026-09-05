"""Share links — create one from the current view, open one someone sent you.

Kept out of `main.py` for the same reason the account routes are: nothing here is
cacheable in the way the catalog endpoints are, and one of the two handlers writes.

See `app.share` for the shape of a stored view and why the slug is the content rather
than a random string.
"""

from __future__ import annotations

import hashlib
import html
import json
import logging
from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from . import auth, db, og, ratelimit, security, share
from .config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["share"])

#: The human- and crawler-facing surface, deliberately outside `/v1`.
#:
#: `/v1` is the JSON API the app talks to, and it is versioned because its shape is a
#: contract with a client we ship. `/s/<slug>` is a *link* — it ends up in chat logs,
#: bookmarks and screenshots, and those outlive any version number we would put in it.
#: One character of prefix is also the shortest the link can be, which is most of the
#: reason permalinks are stored server-side instead of in a fragment.
public_router = APIRouter(tags=["share"])

#: Links one address may mint per window. Content addressing already stops a visitor
#: nudging a slider from filling the table — the same view is the same row — so this only
#: bounds a client generating genuinely different states in a loop.
_CREATE_LIMIT = 60
_CREATE_WINDOW_SECONDS = 600


class ShareBody(BaseModel):
    """A view of the map. Every field optional: an empty body is the default view.

    Deliberately loose here and strict in `app.share`. Pydantic would reject a bad radius
    range with a message about the shape of the request; `share.canonical_state` rejects
    it with a message about the filter, and the same function is what the tests exercise
    without a server.
    """

    filters: dict[str, Any] | None = None
    focus: str | None = None
    camera: dict[str, Any] | None = None
    view: str | None = None
    timelineYear: int | None = None


def _as_json(value: Any) -> Any:
    """asyncpg returns JSONB as text unless a codec is registered pool-wide."""
    return json.loads(value) if isinstance(value, str) else value


@router.post("/share")
async def create_share(
    body: ShareBody,
    request: Request,
    user: auth.AuthUser | None = Depends(auth.optional_user),
) -> dict[str, Any]:
    """Mint (or re-find) the link for a view.

    Idempotent by construction: the slug is a digest of the canonical state, so calling
    this twice with the same view returns the same link and touches one row.
    """
    allowed = await ratelimit.hit(
        f"share:{auth.client_ip(request)}",
        limit=_CREATE_LIMIT,
        window_seconds=_CREATE_WINDOW_SECONDS,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many links. Try again shortly.")

    try:
        state = share.canonical_state(body.model_dump(exclude_none=True))
    except security.ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    focus = state.get("focus")
    if focus is not None:
        # Checked now rather than when the link is opened. A link that points at nothing
        # is broken the moment it is made, and the person who can still fix it is the one
        # standing here — not the stranger who receives it a week later.
        exists = await db.pool().fetchval("SELECT 1 FROM planets WHERE id = $1", focus)
        if exists is None:
            raise HTTPException(status_code=404, detail=f"No planet with id {focus!r}")

    slug = share.slug_for(state)

    row = await db.pool().fetchrow(
        """
        INSERT INTO shared_views (slug, state, created_by) VALUES ($1, $2::jsonb, $3)
        -- The slug already determines the state, so there is nothing to update. The
        -- no-op assignment is what makes RETURNING fire on the second share of a view
        -- instead of the row silently doing nothing.
        ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
        RETURNING slug, created_at, view_count
        """,
        slug,
        share.canonical_json(state),
        user.id if user else None,
    )

    # Only the slug goes back, not a URL: the API has no idea what origin the map is
    # served from, and a guess would be wrong behind every reverse proxy. The client owns
    # the link it hands to a person.
    return {
        "slug": row["slug"],
        "state": state,
        "createdAt": row["created_at"],
        "viewCount": row["view_count"],
    }


@router.get("/share/{slug}")
async def read_share(slug: str) -> dict[str, Any]:
    """Open a shared view."""
    if not share.is_slug(slug):
        raise HTTPException(status_code=404, detail="No such link")

    # Read and count in one statement. It makes the endpoint a write, which is why it
    # carries no cache headers — but a share link is opened a handful of times by the
    # people it was sent to, and knowing which links were never opened is what lets them
    # be swept later. A separate SELECT then UPDATE would cost a second round trip for
    # the same effect.
    row = await db.pool().fetchrow(
        """
        UPDATE shared_views
           SET view_count = view_count + 1, last_viewed_at = now()
         WHERE slug = $1
        RETURNING slug, state, created_at, view_count
        """,
        slug,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="No such link")

    state = _as_json(row["state"])

    # Only a *newer* state is refused. Rather than guess at what a field added in v2
    # meant, the link says it cannot be opened here — better than restoring three
    # quarters of a view and presenting it as the whole one. An older state stays
    # readable: when there is a v2, this is where the upgrade step goes.
    version = state.get("version")
    if not isinstance(version, int) or version > share.STATE_VERSION:
        raise HTTPException(
            status_code=410,
            detail="This link was made by a newer version of the map and cannot be opened here.",
        )

    return {
        "slug": row["slug"],
        "state": state,
        "createdAt": row["created_at"],
        "viewCount": row["view_count"],
    }


# --- Preview cards -----------------------------------------------------------------------
#
# A link pasted into a chat window is ten characters until something fetches a preview for
# it. The two routes below turn it into a planet passport: `/s/<slug>` is an HTML shell
# carrying the Open Graph tags, and `/s/<slug>/card.png` is the picture they point at.
# `app.og` draws the picture and knows nothing about HTTP; this file knows about HTTP and
# nothing about drawing.
#
# Neither route counts a view. `view_count` exists to separate links somebody opened from
# links nobody ever did, and a crawler unfurling a preview is not a person opening one —
# every chat client the link passed through would inflate the count for a link pasted
# once. The count is still incremented by `GET /v1/share/<slug>`, which is what the app
# itself calls once the map has actually loaded the view.

#: Rendered cards, keyed by slug. A card is a pure function of the stored state and the
#: catalog row behind it, so the only thing that can invalidate one is an ingest — hence
#: the run id stored alongside. The cache is small because the working set is: the links
#: being shared right now are the ones being fetched right now.
_CARD_CACHE_MAX = 256
_card_cache: OrderedDict[str, tuple[int | None, str, bytes]] = OrderedDict()

#: An hour. Not `immutable` like the catalog payloads: those carry a snapshot id in the
#: URL and genuinely cannot change, whereas this URL keeps its name while the planet
#: behind it is re-measured by the next ingest. An hour is long enough that a link doing
#: the rounds is served from cache, short enough that a correction shows up the same day.
_CARD_MAX_AGE = 3600


async def _stored_state(slug: str) -> dict[str, Any]:
    """The state behind a slug, read without counting it as a view."""
    if not share.is_slug(slug):
        raise HTTPException(status_code=404, detail="No such link")

    row = await db.pool().fetchrow("SELECT state FROM shared_views WHERE slug = $1", slug)
    if row is None:
        raise HTTPException(status_code=404, detail="No such link")

    state = _as_json(row["state"])
    version = state.get("version")
    if not isinstance(version, int) or version > share.STATE_VERSION:
        raise HTTPException(
            status_code=410,
            detail="This link was made by a newer version of the map and cannot be opened here.",
        )
    return state


async def _build_card(slug: str, state: dict[str, Any]) -> og.Card:
    """The card for a link: a passport when it names a world, a map card otherwise."""
    focus = state.get("focus")
    if isinstance(focus, str):
        row = await db.pool().fetchrow("SELECT * FROM planets WHERE id = $1", focus)
        if row is not None:
            return og.planet_card(dict(row), slug)
        # Creating the link checked that this planet existed, so it has since been
        # renamed or dropped by an ingest. The link still describes a view of the map, so
        # it still gets a card — it just cannot name a world on it.
        log.info("share %s points at missing planet %r; falling back to a map card", slug, focus)

    size = await db.pool().fetchval("SELECT count(*) FROM planets") or 0
    return og.view_card(state, int(size), slug)


async def _card_png(slug: str, state: dict[str, Any]) -> tuple[str, bytes]:
    run_id = await db.current_run_id()
    cached = _card_cache.get(slug)
    if cached is not None and cached[0] == run_id:
        _card_cache.move_to_end(slug)
        return cached[1], cached[2]

    png = og.render(await _build_card(slug, state))
    # Strong, and taken over the bytes themselves. Two ingests that leave a planet
    # untouched produce the same image, and a browser already holding it should be told
    # that rather than sent it again.
    etag = f'"{hashlib.sha256(png).hexdigest()[:32]}"'

    _card_cache[slug] = (run_id, etag, png)
    _card_cache.move_to_end(slug)
    while len(_card_cache) > _CARD_CACHE_MAX:
        _card_cache.popitem(last=False)
    return etag, png


@public_router.get("/s/{slug}/card.png", include_in_schema=False)
async def share_card(slug: str, request: Request) -> Response:
    """The preview image itself, 1200x630."""
    state = await _stored_state(slug)
    etag, png = await _card_png(slug, state)
    headers = {"ETag": etag, "Cache-Control": f"public, max-age={_CARD_MAX_AGE}"}

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    return Response(content=png, media_type="image/png", headers=headers)


def _public_origin(request: Request) -> str:
    """Where this link lives, as the outside world sees it.

    The configured value wins when there is one. Otherwise the request is believed, which
    is right for the deployment this is built for — `/s/` proxied from the same origin
    that serves the app — and is why the bounce below is a relative URL: it needs no
    origin at all, so it cannot be wrong about one.
    """
    configured = get_settings().public_base_url.strip().rstrip("/")
    return configured or str(request.base_url).rstrip("/")


_PREVIEW_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{page_url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Exoplanet Explorer">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{page_url}">
<meta property="og:image" content="{image_url}">
<meta property="og:image:width" content="{width}">
<meta property="og:image:height" content="{height}">
<meta property="og:image:alt" content="{description}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{image_url}">
<meta http-equiv="refresh" content="0; url={target}">
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center;
          background: #060a16; color: #e8eef8;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }}
  main {{ max-width: 640px; padding: 32px; text-align: center; }}
  img {{ width: 100%; height: auto; border-radius: 14px;
         border: 1px solid rgba(255, 255, 255, 0.1); }}
  h1 {{ font-size: 20px; font-weight: 600; margin: 22px 0 6px; }}
  p {{ color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }}
  a {{ color: #22d3ee; }}
</style>
</head>
<body>
<main>
  <img src="{image_url}" alt="{description}" width="{width}" height="{height}">
  <h1>{title}</h1>
  <p>{description}</p>
  <a href="{target}">Open the map</a>
</main>
<script>location.replace({target_js});</script>
</body>
</html>
"""


def preview_html(card: og.Card, *, page_url: str, image_url: str, target: str) -> str:
    """The bounce page for one link.

    Pure, and separate from the handler, because the risky part of it is escaping rather
    than routing. Most of what lands in these tags is our own catalog, but not all: a
    shared view can carry the visitor's search box, and that text reaches `og:description`
    and the visible caption. So it is a function with tests rather than an f-string in a
    handler that only ever runs against a database.
    """
    return _PREVIEW_TEMPLATE.format(
        title=html.escape(f"{card.title} · Exoplanet Explorer", quote=True),
        description=html.escape(card.description, quote=True),
        page_url=html.escape(page_url, quote=True),
        image_url=html.escape(image_url, quote=True),
        width=og.CARD_WIDTH,
        height=og.CARD_HEIGHT,
        target=html.escape(target, quote=True),
        # JSON, not HTML: this one lands inside a script element, where `&amp;` would be
        # four characters of the string rather than an escape.
        target_js=json.dumps(target),
    )


@public_router.get("/s/{slug}", include_in_schema=False)
async def share_preview(slug: str, request: Request) -> Response:
    """The page a link actually points at: metadata for crawlers, a bounce for people.

    Served as 200 HTML rather than a 302 to the app, on purpose. The redirect is the
    obvious implementation and it defeats the whole feature: a crawler that follows it
    lands on the SPA's static `index.html`, whose Open Graph tags describe the map in
    general and cannot describe *this* link — the state lives in a table, and nothing in a
    file built at deploy time can know it. So the tags are served here, and the browser is
    bounced by `<meta refresh>` plus `location.replace`, which keeps the hop out of the
    visitor's back-button history.

    The bounce is a relative URL unless `public_base_url` says otherwise, because this
    route is meant to be proxied onto the origin that serves the app. Somebody who reaches
    it another way still gets a real page: the card, the caption, and a link to click.
    """
    state = await _stored_state(slug)
    card = await _build_card(slug, state)

    origin = _public_origin(request)
    base = get_settings().public_base_url.strip().rstrip("/")
    target = f"{base}/?v={slug}" if base else f"/?v={slug}"

    body = preview_html(
        card,
        page_url=f"{origin}/s/{slug}",
        image_url=f"{origin}/s/{slug}/card.png",
        target=target,
    )
    # Short-lived: the state behind a slug never changes, but the description quotes
    # catalog numbers that an ingest can revise.
    return HTMLResponse(body, headers={"Cache-Control": f"public, max-age={_CARD_MAX_AGE}"})
