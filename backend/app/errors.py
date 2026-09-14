from fastapi import HTTPException


class ApiError(HTTPException):
    """Error with a stable machine-readable code the frontend translates.

    Body shape: {"detail": {"code": str, "message": str, "fields"?: {field: error_code}}}
    """

    def __init__(self, status_code: int, code: str, message: str, fields: dict[str, str] | None = None):
        detail: dict = {"code": code, "message": message}
        if fields:
            detail["fields"] = fields
        super().__init__(status_code=status_code, detail=detail)
