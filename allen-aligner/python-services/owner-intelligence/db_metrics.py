import os
from datetime import datetime, timezone

import psycopg
from fastapi import HTTPException


def connection():
    password = os.environ.get("AA_OWNER_DB_PASSWORD")

    if not password:
        raise RuntimeError("Database password not configured")

    return psycopg.connect(
        host=os.environ.get("AA_OWNER_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("AA_OWNER_DB_PORT", "5432")),
        dbname=os.environ.get("AA_OWNER_DB_NAME", "allen_aligner"),
        user=os.environ.get("AA_OWNER_DB_USER", "owner_analytics_ro"),
        password=password,
        connect_timeout=5,
        options=(
            "-c default_transaction_read_only=on "
            "-c statement_timeout=5000"
        ),
    )


def db_health():
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return "connected"
    except Exception:
        return "unavailable"


def employee_kpis():
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT COUNT(*) FROM public."Employee"')
                total = cur.fetchone()[0]

                cur.execute("""
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'Employee'
                          AND column_name = 'status'
                    )
                """)
                has_status = cur.fetchone()[0]

                active = None

                if has_status:
                    cur.execute("""
                        SELECT COUNT(*)
                        FROM public."Employee"
                        WHERE UPPER("status"::text) = 'ACTIVE'
                    """)
                    active = cur.fetchone()[0]

        return {
            "database": "connected",
            "source": "Employee",
            "measured_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "metrics": {
                "total_employees": total,
                "active_employees": active,
            },
            "finance": "not_connected",
            "production": "not_connected",
            "quality": "not_connected",
            "inventory": "not_connected",
            "machines": "not_connected",
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Owner analytics database unavailable",
        )
