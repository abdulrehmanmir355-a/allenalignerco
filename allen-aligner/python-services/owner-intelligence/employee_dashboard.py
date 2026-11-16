import os
import hmac
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException
from db_metrics import connection
router = APIRouter(prefix="/owner/employees")
def require_key(key):
    expected = os.environ.get("OWNER_ENGINE_KEY", "")
    if not expected or not key or not hmac.compare_digest(key, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
@router.get("/dashboard")
def dashboard(x_engine_key: str | None = Header(default=None)):
    require_key(x_engine_key)
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*),
                           COUNT(*) FILTER (
                             WHERE UPPER("status"::text) = 'ACTIVE'
                           ),
                           COUNT(DISTINCT "id")
                    FROM public."Employee"
                """)
                total, active, unique_ids = cur.fetchone()
                cur.execute("""
                    SELECT "id"::text, "status"::text
                    FROM public."Employee"
                    ORDER BY "id"
                    LIMIT 50
                """)
                employees = cur.fetchall()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Employee data unavailable"
        )
    return {
        "total": total,
        "active": active,
        "other": total - active,
        "unique_database_ids": unique_ids,
        "duplicate_database_ids": total - unique_ids,
        "employee_code_validation": "not_yet_connected",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "employees": [
            {"id": row[0], "status": row[1]}
            for row in employees
        ]
    }