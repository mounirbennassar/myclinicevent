from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import settings
from ..db import get_db
from ..emailer import queue_password_reset_email
from ..errors import ApiError
from ..models import User
from ..ratelimit import check_rate
from ..schemas import ChangePasswordIn, ForgotPasswordIn, LoginIn, ResetPasswordIn, UserOut
from ..security import (
    clear_session_cookie,
    create_reset_token,
    get_current_user,
    hash_password,
    needs_rehash,
    set_session_cookie,
    user_from_reset_token,
    verify_password,
)
from ..services import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    check_rate(request, "login", 10, 15 * 60, email)
    user = db.scalar(select(User).where(User.email == email))
    if not verify_password(body.password, user.password_hash if user else None):
        audit(
            db, actor=None, action="auth.login_failed", entity_type="user",
            entity_id=user.id if user else None, details={"email": email}, request=request,
        )
        db.commit()
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    if not user.is_active:
        raise ApiError(403, "account_disabled", "This account has been deactivated. Contact a super admin.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    user.last_login_at = utcnow()
    audit(db, actor=user, action="auth.login", entity_type="user", entity_id=user.id, request=request)
    db.commit()
    set_session_cookie(response, user)
    return user


@router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=UserOut)
def change_password(
    body: ChangePasswordIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(400, "wrong_password", "Your current password is incorrect.", {"current_password": "wrong_password"})
    if body.new_password == body.current_password:
        raise ApiError(422, "validation", "Choose a different password.", {"new_password": "password_same"})
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.token_version += 1  # signs out other devices
    audit(db, actor=user, action="auth.password_changed", entity_type="user", entity_id=user.id, request=request)
    db.commit()
    set_session_cookie(response, user)
    return user


@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)
):
    email = body.email.strip().lower()
    check_rate(request, "forgot", 5, 15 * 60, email)
    user = db.scalar(select(User).where(User.email == email))
    if user is not None and user.is_active:
        link = f"{settings.public_base_url.rstrip('/')}/reset-password?token={create_reset_token(user)}"
        queue_password_reset_email(background, user, link)
        audit(db, actor=None, action="auth.reset_requested", entity_type="user", entity_id=user.id, request=request)
        db.commit()
    # Same answer either way, so this can't be used to find out who has an account.
    return {"ok": True}


@router.post("/reset-password", response_model=UserOut)
def reset_password(body: ResetPasswordIn, request: Request, response: Response, db: Session = Depends(get_db)):
    check_rate(request, "reset", 10, 15 * 60)
    user = user_from_reset_token(db, body.token)
    if user is None:
        raise ApiError(400, "reset_link_invalid", "This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.token_version += 1  # makes the link single-use and signs out other devices
    audit(db, actor=user, action="auth.password_reset_via_link", entity_type="user", entity_id=user.id, request=request)
    db.commit()
    set_session_cookie(response, user)
    return user
