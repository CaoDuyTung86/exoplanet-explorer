"""Runtime configuration, read from the environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://exo:exo_dev_password@localhost:5433/exoplanets"

    # NASA Exoplanet Archive, Table Access Protocol endpoint.
    nasa_tap_url: str = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
    nasa_timeout_seconds: float = 120.0

    # Comma-separated list; the Vite dev server runs on 3001.
    cors_origins: str = "http://localhost:3001,http://127.0.0.1:3001"

    # How long browsers and CDNs may keep a versioned catalog payload. The URL carries
    # the snapshot id, so a stale copy can never be served for new data.
    catalog_max_age_seconds: int = 60 * 60 * 24 * 7

    # --- Accounts (Phase 3) -------------------------------------------------------
    # How long a login lasts before the browser has to sign in again.
    session_ttl_days: int = 30
    # Set to true behind HTTPS so the session cookie is never sent over plain http.
    # Left false by default because local development is http://localhost.
    cookie_secure: bool = False
    # Failed logins allowed per email+IP inside the window, before a cooldown kicks in.
    login_attempt_limit: int = 10
    login_attempt_window_seconds: int = 900

    # --- Share links and preview cards (Phase 3) ----------------------------------
    # Where the map is served from, as seen by the outside world. Set it when the API and
    # the frontend do not share an origin, or when the public URL is not what the request
    # says it is (a proxy that does not forward X-Forwarded-*).
    #
    # Left empty by default and derived from the request instead, which is right for the
    # intended deployment: `/s/` is proxied to this service from the same origin that
    # serves the app, exactly as the Vite dev server does. Then the preview page can
    # bounce a visitor to `/?v=<slug>` with a relative URL and be correct on any port.
    public_base_url: str = ""

    # --- Presence (Phase 3) -------------------------------------------------------
    # Redis carries presence between API processes. Optional: with no Redis reachable
    # the hub falls back to a single-process in-memory registry and says so in the logs.
    redis_url: str = "redis://localhost:6380/0"
    # A peer that has not sent a heartbeat within this window is considered gone. The
    # client pings at a third of this, so two dropped pings are survivable.
    presence_ttl_seconds: int = 45
    # Upper bound on simultaneously tracked visitors, so a broadcast stays bounded.
    presence_max_peers: int = 200

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
