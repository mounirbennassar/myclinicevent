from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://localhost/myclinic_events"
    secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 60 * 12
    cookie_name: str = "mce_session"
    cookie_secure: bool = False
    # The API sits behind the Next.js proxy, so the client IP arrives in X-Forwarded-For.
    trust_proxy: bool = True
    public_base_url: str = "http://localhost:3000"

    # Bootstrap account, created on startup if no user with this email exists.
    superadmin_email: str | None = None
    superadmin_password: str | None = None
    superadmin_name: str = "Super Admin"

    # Email is optional. Resend is used when RESEND_API_KEY is set, otherwise SMTP when SMTP_HOST is set.
    # With neither, messages are written to the log so local development works unchanged.
    email_from: str = "My Clinic Educational <events@myclinic.com.sa>"
    # Where attendee replies land. Should be a real mailbox someone reads.
    email_reply_to: str | None = None
    resend_api_key: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    smtp_ssl: bool = False

    default_timezone: str = "Asia/Riyadh"
    strict_national_id: bool = True
    rate_limit_enabled: bool = True
    # Auto-mode scans of the same attendee inside this window are treated as a double read.
    scan_cooldown_seconds: int = 45
    # Scans are accepted from this many hours before the first session until this many after the last.
    scan_window_margin_hours: int = 3

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
