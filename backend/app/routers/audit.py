from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, User
from ..security import require_super_admin

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(
    event_id: int | None = None,
    action: str | None = None,
    actor_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    q = select(AuditLog)
    if event_id is not None:
        q = q.where(AuditLog.event_id == event_id)
    if action:
        q = q.where(AuditLog.action.startswith(action))
    if actor_id is not None:
        q = q.where(AuditLog.actor_id == actor_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    logs = db.scalars(
        q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {
        "items": [
            {
                "id": log.id,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "event_id": log.event_id,
                "details": log.details,
                "ip": log.ip,
                "created_at": log.created_at,
                "actor": {"id": log.actor.id, "full_name": log.actor.full_name, "email": log.actor.email}
                if log.actor else None,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
