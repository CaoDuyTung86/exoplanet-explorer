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

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
