from fastapi import Request
from sqlalchemy.orm import Session

from .models import AuditLog, User
from .ratelimit import client_ip


def audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | str | None = None,
    event_id: int | None = None,
    details: dict | None = None,
    request: Request | None = None,
) -> None:
    """Record an action. Added to the current transaction; the caller commits."""
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            event_id=event_id,
            details=details or {},
            ip=client_ip(request),
        )
    )
