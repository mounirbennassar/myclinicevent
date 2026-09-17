import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import User
from .routers import (
    audit, auth, events, member_portal, public, registrations, scans, sponsor_portal, sponsors_admin, sponsors_public,
    stats, users,
)
from .security import hash_password

log = logging.getLogger("mce")


def ensure_superadmin() -> None:
    """Create the bootstrap super admin from SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD if missing."""
    if not (settings.superadmin_email and settings.superadmin_password):
        return
    email = settings.superadmin_email.strip().lower()
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == email)):
            return
        db.add(User(
            email=email,
            full_name=settings.superadmin_name,
            password_hash=hash_password(settings.superadmin_password),
            role="super_admin",
            is_active=True,
            token_version=0,
        ))
        db.commit()
        log.info("Created super admin %s", email)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO)
    if settings.is_production and settings.secret_key.startswith("dev-"):
        raise RuntimeError("Set SECRET_KEY before running in production.")
    try:
        ensure_superadmin()
    except Exception:
        log.exception("Could not create the super admin. Have the migrations run? (alembic upgrade head)")
    yield


app = FastAPI(
    title="My Clinic Educational — Events API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
# Attendee lists and stats are large JSON payloads; compress anything over 1 KB.
app.add_middleware(GZipMiddleware, minimum_size=1024)

for module in (
    auth, users, events, registrations, scans, stats, public, audit, sponsors_public, sponsors_admin, sponsor_portal,
    member_portal,
):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
