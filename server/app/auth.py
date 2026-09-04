"""User accounts and sessions, backed by Postgres.

The rules live in `security.py`; this module is the part that reads and writes rows and
exposes FastAPI dependencies. Sessions are opaque tokens in an httpOnly cookie:

    login  -> generate 32 random bytes -> store SHA-256 -> hand the raw token to the
              browser as a cookie the browser's JavaScript cannot read
    request -> hash the cookie -> primary-key lookup -> user row
    logout -> delete the row, and the token is dead everywhere, immediately
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg
from fastapi import Cookie, Depends, HTTPException, Request, Response

from . import db, security
from .config import get_settings

log = logging.getLogger(__name__)


class AuthUser:
    """The authenticated caller. Deliberately not a Pydantic model — it never leaves
    the server as-is; `public_user()` decides what is safe to serialise."""

    __slots__ = ("id", "email", "display_name")

    def __init__(self, row: asyncpg.Record | dict[str, Any]):
        self.id: int = row["id"]
        self.email: str = row["email"]
        self.display_name: str = row["display_name"]


def public_user(user: AuthUser) -> dict[str, Any]:
    return {"id": user.id, "email": user.email, "displayName": user.display_name}


# --- users -----------------------------------------------------------------------


async def create_user(email: str, password: str, display_name: str) -> AuthUser:
    """Register. Raises ValidationError for bad input, HTTPException 409 for a dupe."""
    normalised = security.normalise_email(email)
    security.check_password_strength(password)
    name = security.clean_display_name(display_name, fallback=normalised.split("@")[0])

    try:
        row = await db.pool().fetchrow(
            """
            INSERT INTO users (email, display_name, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id, email, display_name
            """,
            normalised,
            name,
            security.hash_password(password),
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="That email is already registered.") from exc

    return AuthUser(row)


async def authenticate(email: str, password: str) -> AuthUser | None:
    """Check a password. Returns None for both "no such user" and "wrong password" so
    the caller cannot turn the endpoint into an account-existence oracle."""
    normalised = security.normalise_email(email)
    row = await db.pool().fetchrow(
        "SELECT id, email, display_name, password_hash FROM users WHERE email = $1",
        normalised,
    )
    if row is None:
        # Spend roughly the same time as a real verification would, so response latency
        # does not leak whether the address is registered.
        security.hash_password(password)
        return None

    if not security.verify_password(row["password_hash"], password):
        return None

    if security.needs_rehash(row["password_hash"]):
        await db.pool().execute(
            "UPDATE users SET password_hash = $2 WHERE id = $1",
            row["id"],
            security.hash_password(password),
        )

    await db.pool().execute(
        "UPDATE users SET last_login_at = now() WHERE id = $1", row["id"]
    )
    return AuthUser(row)


# --- sessions --------------------------------------------------------------------


async def start_session(user: AuthUser, user_agent: str | None) -> str:
    """Create a session row and return the raw token (the only time it exists)."""
    settings = get_settings()
    token = security.new_session_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)

    await db.pool().execute(
        """
        INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
        VALUES ($1, $2, $3, $4)
        """,
        security.hash_token(token),
        user.id,
        expires,
        (user_agent or "")[:400] or None,
    )
    return token


async def resolve_session(token: str | None) -> AuthUser | None:
    """Cookie -> user, or None. Expired rows are deleted on the way past."""
    if not token:
        return None

    row = await db.pool().fetchrow(
        """
        SELECT u.id, u.email, u.display_name, s.expires_at
          FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1
        """,
        security.hash_token(token),
    )
    if row is None:
        return None

    if row["expires_at"] <= datetime.now(timezone.utc):
        await end_session(token)
        return None

    return AuthUser(row)


async def touch_session(token: str) -> None:
    await db.pool().execute(
        "UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1",
        security.hash_token(token),
    )


async def end_session(token: str) -> None:
    await db.pool().execute(
        "DELETE FROM sessions WHERE token_hash = $1", security.hash_token(token)
    )


async def purge_expired_sessions() -> int:
    """Housekeeping, run at startup. Expired rows are already rejected by
    `resolve_session`; this just stops the table growing without bound."""
    result = await db.pool().execute("DELETE FROM sessions WHERE expires_at <= now()")
    return int(result.rsplit(" ", 1)[-1] or 0)


# --- cookie plumbing --------------------------------------------------------------


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        security.SESSION_COOKIE,
        token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,          # not readable from JavaScript, so XSS cannot lift it
        samesite="lax",         # blocks the cookie on cross-site POSTs, i.e. CSRF
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        security.SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


# --- FastAPI dependencies ---------------------------------------------------------


async def optional_user(
    exo_session: str | None = Cookie(default=None, alias=security.SESSION_COOKIE),
) -> AuthUser | None:
    return await resolve_session(exo_session)


async def current_user(user: AuthUser | None = Depends(optional_user)) -> AuthUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to use this.")
    return user


def client_ip(request: Request) -> str:
    """Best-effort client address for rate limiting.

    `X-Forwarded-For` is trusted here because the only deployment in front of this is our
    own reverse proxy. Exposed directly to the internet, this header is spoofable and the
    limiter would need to fall back to `request.client`.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
