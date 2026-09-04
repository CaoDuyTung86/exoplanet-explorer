"""Accounts, bookmarks and saved filters — everything behind a login.

The catalog endpoints stay anonymous and cacheable; nothing in this router is cacheable,
so it is kept in its own module rather than threaded through main.py.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import auth, db, ratelimit, security
from .config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["accounts"])


# --- request bodies ---------------------------------------------------------------


class RegisterBody(BaseModel):
    email: str
    password: str
    displayName: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


class BookmarkBody(BaseModel):
    planetId: str
    note: str | None = Field(default=None, max_length=500)


class SavedFilterBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    # The filter shape belongs to the client; the server stores and returns it verbatim.
    filters: dict[str, Any]


# --- auth -------------------------------------------------------------------------


@router.post("/auth/register")
async def register(body: RegisterBody, request: Request, response: Response) -> dict[str, Any]:
    settings = get_settings()

    # Registration is rate limited by address alone: there is no account to key on yet,
    # and this is the endpoint that would otherwise let one host create users in bulk.
    allowed = await ratelimit.hit(
        f"register:{auth.client_ip(request)}",
        limit=settings.login_attempt_limit,
        window_seconds=settings.login_attempt_window_seconds,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    try:
        user = await auth.create_user(body.email, body.password, body.displayName)
    except security.ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = await auth.start_session(user, request.headers.get("user-agent"))
    auth.set_session_cookie(response, token)
    return {"user": auth.public_user(user)}


@router.post("/auth/login")
async def login(body: LoginBody, request: Request, response: Response) -> dict[str, Any]:
    settings = get_settings()
    # Keyed on address *and* email so one noisy network cannot lock out an account, and
    # one attacker cannot walk a password list across many accounts from one host.
    bucket = f"login:{auth.client_ip(request)}:{body.email.strip().lower()[:120]}"

    allowed = await ratelimit.hit(
        bucket,
        limit=settings.login_attempt_limit,
        window_seconds=settings.login_attempt_window_seconds,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    try:
        user = await auth.authenticate(body.email, body.password)
    except security.ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if user is None:
        # One message for both "no such account" and "wrong password", so the response
        # cannot be used to enumerate which addresses are registered.
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    await ratelimit.reset(bucket)
    token = await auth.start_session(user, request.headers.get("user-agent"))
    auth.set_session_cookie(response, token)
    return {"user": auth.public_user(user)}


@router.post("/auth/logout")
async def logout(
    response: Response,
    exo_session: str | None = Cookie(default=None, alias=security.SESSION_COOKIE),
) -> dict[str, bool]:
    if exo_session:
        await auth.end_session(exo_session)
    auth.clear_session_cookie(response)
    return {"ok": True}


@router.get("/auth/me")
async def me(user: auth.AuthUser | None = Depends(auth.optional_user)) -> dict[str, Any]:
    """Who the cookie belongs to. 200 with a null user when signed out, so the client can
    boot without treating "not signed in" as an error."""
    return {"user": auth.public_user(user) if user else None}


# --- bookmarks --------------------------------------------------------------------


@router.get("/me/bookmarks")
async def list_bookmarks(user: auth.AuthUser = Depends(auth.current_user)) -> dict[str, Any]:
    """Bookmarks joined to the catalog, so the client can render the list without
    already holding the planet — the table view and the map both use this."""
    rows = await db.pool().fetch(
        """
        SELECT b.planet_id, b.note, b.created_at,
               p.pl_name, p.hostname, p.habitability_score, p.distance_ly, p.size_category
          FROM bookmarks b JOIN planets p ON p.id = b.planet_id
         WHERE b.user_id = $1
         ORDER BY b.created_at DESC
        """,
        user.id,
    )
    return {
        "bookmarks": [
            {
                "planetId": r["planet_id"],
                "note": r["note"],
                "createdAt": r["created_at"],
                "planetName": r["pl_name"],
                "hostname": r["hostname"],
                "habitabilityScore": r["habitability_score"],
                "distanceLy": r["distance_ly"],
                "sizeCategory": r["size_category"],
            }
            for r in rows
        ]
    }


@router.post("/me/bookmarks")
async def add_bookmark(
    body: BookmarkBody, user: auth.AuthUser = Depends(auth.current_user)
) -> dict[str, Any]:
    exists = await db.pool().fetchval("SELECT 1 FROM planets WHERE id = $1", body.planetId)
    if not exists:
        raise HTTPException(status_code=404, detail=f"No planet with id {body.planetId!r}")

    # Re-bookmarking updates the note instead of failing on the primary key.
    await db.pool().execute(
        """
        INSERT INTO bookmarks (user_id, planet_id, note) VALUES ($1, $2, $3)
        ON CONFLICT (user_id, planet_id) DO UPDATE SET note = EXCLUDED.note
        """,
        user.id,
        body.planetId,
        body.note,
    )
    return {"ok": True, "planetId": body.planetId}


@router.delete("/me/bookmarks/{planet_id}")
async def remove_bookmark(
    planet_id: str, user: auth.AuthUser = Depends(auth.current_user)
) -> dict[str, Any]:
    result = await db.pool().execute(
        "DELETE FROM bookmarks WHERE user_id = $1 AND planet_id = $2", user.id, planet_id
    )
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="That planet was not bookmarked.")
    return {"ok": True, "planetId": planet_id}


# --- saved filters ----------------------------------------------------------------


@router.get("/me/filters")
async def list_saved_filters(
    user: auth.AuthUser = Depends(auth.current_user),
) -> dict[str, Any]:
    rows = await db.pool().fetch(
        """
        SELECT id, name, filters, updated_at FROM saved_filters
         WHERE user_id = $1 ORDER BY updated_at DESC
        """,
        user.id,
    )
    return {
        "filters": [
            {
                "id": r["id"],
                "name": r["name"],
                # asyncpg hands JSONB back as text unless a codec is registered; the
                # column is stored by us and always an object.
                "filters": _as_json(r["filters"]),
                "updatedAt": r["updated_at"],
            }
            for r in rows
        ]
    }


@router.post("/me/filters")
async def save_filter(
    body: SavedFilterBody, user: auth.AuthUser = Depends(auth.current_user)
) -> dict[str, Any]:
    name = security.clean_display_name(body.name, fallback="")
    if not name:
        raise HTTPException(status_code=400, detail="Give the preset a name.")

    row = await db.pool().fetchrow(
        """
        INSERT INTO saved_filters (user_id, name, filters) VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (user_id, name)
        DO UPDATE SET filters = EXCLUDED.filters, updated_at = now()
        RETURNING id, name, updated_at
        """,
        user.id,
        name,
        json.dumps(body.filters),
    )
    return {"id": row["id"], "name": row["name"], "updatedAt": row["updated_at"]}


@router.delete("/me/filters/{filter_id}")
async def delete_saved_filter(
    filter_id: int, user: auth.AuthUser = Depends(auth.current_user)
) -> dict[str, Any]:
    result = await db.pool().execute(
        "DELETE FROM saved_filters WHERE id = $1 AND user_id = $2", filter_id, user.id
    )
    if result.endswith(" 0"):
        raise HTTPException(status_code=404, detail="No such saved filter.")
    return {"ok": True}


def _as_json(value: Any) -> Any:
    if isinstance(value, str):
        return json.loads(value)
    return value
