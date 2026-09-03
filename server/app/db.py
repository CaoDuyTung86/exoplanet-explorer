"""Postgres connection pool and a deliberately small migration runner.

There is no Alembic here on purpose. The schema is a handful of tables written as plain
SQL, and applying them in order with a ``schema_migrations`` ledger is about twenty lines.
That keeps the SQL readable as SQL. If the schema starts churning in Phase 3, swapping in
Alembic is the right move.
"""

from __future__ import annotations

import logging
from pathlib import Path

import asyncpg

from .config import get_settings

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

_pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    """Create the shared pool. Safe to call once at startup."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=10,
            command_timeout=60,
        )
        log.info("connected to postgres")
    return _pool


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("database pool is not initialised; call connect() first")
    return _pool


async def run_migrations() -> list[str]:
    """Apply every .sql file in migrations/ that has not run yet, in filename order."""
    applied: list[str] = []
    async with pool().acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename   TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        done = {r["filename"] for r in await conn.fetch("SELECT filename FROM schema_migrations")}

        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            log.info("applying migration %s", path.name)
            # One transaction per file: a half-applied migration is never committed.
            async with conn.transaction():
                await conn.execute(path.read_text(encoding="utf-8"))
                await conn.execute(
                    "INSERT INTO schema_migrations (filename) VALUES ($1)", path.name
                )
            applied.append(path.name)

    return applied
