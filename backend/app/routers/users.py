from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..emailer import queue_account_email
from ..errors import ApiError
from ..models import User
from ..schemas import UserCreate, UserOut, UserUpdate, UserWithPassword
from ..security import generate_password, hash_password, require_admin, require_super_admin
from ..validators import clean_email

router = APIRouter(prefix="/users", tags=["users"])


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(404, "user_not_found", "User not found.")
    return user


def _active_super_admins(db: Session) -> int:
    return db.scalar(
        select(func.count()).select_from(User).where(User.role == "super_admin", User.is_active.is_(True))
    ) or 0


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Admins can see the team to assign people to events; only super admins can change it.
    # Sponsor portal accounts are managed from each event's Sponsors tab, not here.
    return db.scalars(select(User).where(User.role != "sponsor").order_by(User.created_at)).all()


@router.post("", response_model=UserWithPassword, status_code=201)
def create_user(
    body: UserCreate,
    request: Request,
    background: BackgroundTasks,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    email, err = clean_email(body.email)
    if err:
        raise ApiError(422, "validation", "Enter a valid email address.", {"email": err})
    if db.scalar(select(User.id).where(User.email == email)):
        raise ApiError(409, "email_taken", "A user with this email already exists.", {"email": "email_taken"})
    temporary = None if body.password else generate_password()
    user = User(
        email=email,
        full_name=body.full_name.strip(),
        role=body.role,
        password_hash=hash_password(body.password or temporary),
        must_change_password=temporary is not None,
        is_active=True,
        token_version=0,
    )
    db.add(user)
    db.flush()
    audit(
        db, actor=actor, action="user.created", entity_type="user", entity_id=user.id,
        details={"email": email, "role": body.role}, request=request,
    )
    db.commit()
    # Only generated passwords are emailed; one the super admin typed is theirs to share.
    sent = queue_account_email(background, user, temporary, reset=False) if temporary else False
    return {"user": UserOut.model_validate(user), "temporary_password": temporary, "email_sent": sent}


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    user = _get_user(db, user_id)
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    new_role = data.get("role", user.role)
    deactivating = data.get("is_active") is False
    if user.id == actor.id and (new_role != user.role or deactivating):
        raise ApiError(422, "self_change", "You can't change your own role or deactivate your own account.")
    if user.role == "super_admin" and user.is_active and (new_role != "super_admin" or deactivating):
        if _active_super_admins(db) <= 1:
            raise ApiError(422, "last_super_admin", "There must always be at least one active super admin.")
    if "full_name" in data:
        user.full_name = data["full_name"].strip()
    user.role = new_role
    if "is_active" in data:
        if user.is_active and not data["is_active"]:
            user.token_version += 1  # sign them out everywhere
        user.is_active = data["is_active"]
    audit(db, actor=actor, action="user.updated", entity_type="user", entity_id=user.id, details=data, request=request)
    db.commit()
    return user


@router.post("/{user_id}/reset-password", response_model=UserWithPassword)
def reset_password(
    user_id: int,
    request: Request,
    background: BackgroundTasks,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    user = _get_user(db, user_id)
    temporary = generate_password()
    user.password_hash = hash_password(temporary)
    user.must_change_password = True
    user.token_version += 1
    audit(db, actor=actor, action="user.password_reset", entity_type="user", entity_id=user.id, request=request)
    db.commit()
    sent = queue_account_email(background, user, temporary, reset=True)
    return {"user": UserOut.model_validate(user), "temporary_password": temporary, "email_sent": sent}
