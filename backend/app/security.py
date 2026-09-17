import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .errors import ApiError
from .models import Event, EventStaff, User

ADMIN_ROLES = ("super_admin", "admin")

_hasher = PasswordHasher()
# Verified against when the email doesn't exist, so response time doesn't reveal valid accounts.
_DUMMY_HASH = _hasher.hash(secrets.token_hex(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        ok = _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return ok and password_hash is not None


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def generate_password() -> str:
    return secrets.token_urlsafe(9)


def create_session_token(user: User) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "tv": user.token_version,
        "role": user.role,
        "purpose": "session",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


RESET_TOKEN_MINUTES = 60


def create_reset_token(user: User) -> str:
    """Password-reset link token. Single use: resetting bumps token_version, which invalidates it."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "tv": user.token_version,
        "purpose": "reset",
        "iat": now,
        "exp": now + timedelta(minutes=RESET_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def user_from_reset_token(db: Session, token: str) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload.get("sub", 0)))
    except (jwt.PyJWTError, ValueError):
        return None
    if payload.get("purpose") != "reset" or user is None or not user.is_active:
        return None
    if user.token_version != payload.get("tv"):
        return None
    return user


def set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        settings.cookie_name,
        create_session_token(user),
        max_age=settings.access_token_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.cookie_name, path="/")


def _token_from_request(request: Request) -> str | None:
    token = request.cookies.get(settings.cookie_name)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = _token_from_request(request)
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload.get("sub", 0)))
    except (jwt.PyJWTError, ValueError):
        return None
    # A reset-link token must never work as a session.
    if payload.get("purpose") != "session":
        return None
    if user is None or not user.is_active or user.token_version != payload.get("tv"):
        return None
    return user


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise ApiError(401, "not_authenticated", "Please sign in to continue.")
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise ApiError(403, "forbidden", "You don't have permission to do that.")
        return user

    return dependency


require_admin = require_roles(*ADMIN_ROLES)
require_super_admin = require_roles("super_admin")


def access_level(db: Session, event_id: int, user: User) -> str | None:
    """manager | scanner | None. Admins manage every event; staff only what they're assigned.
    Sponsor portal users and members never get event access, whatever they're assigned."""
    if user.role in ADMIN_ROLES:
        return "manager"
    if user.role in ("sponsor", "member"):
        return None
    link = db.get(EventStaff, (event_id, user.id))
    return link.role if link else None


@dataclass
class EventAccess:
    event: Event
    user: User
    level: str

    @property
    def is_manager(self) -> bool:
        return self.level == "manager"


def event_access(min_level: str = "scanner"):
    def dependency(
        event_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> EventAccess:
        event = db.get(Event, event_id)
        level = access_level(db, event_id, user) if event else None
        # Same 404 for "missing" and "not yours" so staff can't probe other events.
        if event is None or level is None:
            raise ApiError(404, "event_not_found", "Event not found.")
        if min_level == "manager" and level != "manager":
            raise ApiError(403, "forbidden", "Only event managers can do that.")
        return EventAccess(event=event, user=user, level=level)

    return dependency
