"""Password hashing, session tokens and input normalisation.

Kept free of database and FastAPI imports so every rule in here is unit-testable without
a Postgres running. `auth.py` is the part that talks to the database.
"""

from __future__ import annotations

import hashlib
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

# Argon2id with the library defaults: memory-hard, and the parameters travel inside the
# hash string, so raising them later does not invalidate existing hashes — a login with
# an outdated hash is re-hashed on the spot (see `needs_rehash`).
_hasher = PasswordHasher()

SESSION_COOKIE = "exo_session"
# 32 bytes of urandom, urlsafe-encoded. Guessing one is not a threat model.
TOKEN_BYTES = 32

MIN_PASSWORD_LENGTH = 8
# Argon2 has no low password-length cap, but a bound keeps a 10 MB "password" from
# turning a login into a memory-hard denial of service.
MAX_PASSWORD_LENGTH = 200
MAX_DISPLAY_NAME_LENGTH = 40

# Deliberately permissive: this validates shape, not deliverability. The only thing that
# proves an address exists is sending mail to it.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")


class ValidationError(ValueError):
    """Raised for input the caller can fix; the API turns this into a 400."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash used weaker parameters than the ones we use now."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def new_session_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    """What actually goes in the database.

    SHA-256 with no salt on purpose: the token is already 256 bits of uniform randomness,
    so there is no dictionary to defend against, and an unsalted digest is what makes the
    lookup a primary-key hit rather than a table scan.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalise_email(email: str) -> str:
    """Lower-case and trim, then check the shape. The column is UNIQUE on this value."""
    cleaned = email.strip().lower()
    if not cleaned or len(cleaned) > 254 or not _EMAIL_RE.match(cleaned):
        raise ValidationError("That does not look like an email address.")
    return cleaned


def check_password_strength(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValidationError(
            f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
        )


def clean_display_name(name: str, *, fallback: str) -> str:
    """Strip control characters and clamp the length.

    This string is rendered next to other people's names in the presence bar, so it is
    treated as hostile input even though React escapes it on the way out.
    """
    stripped = "".join(ch for ch in name if ch.isprintable()).strip()
    if not stripped:
        return fallback
    return stripped[:MAX_DISPLAY_NAME_LENGTH]
