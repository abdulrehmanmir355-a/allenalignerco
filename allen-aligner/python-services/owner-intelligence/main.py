import os
import hmac
from db_metrics import db_health, employee_kpis
from manufacturing_audit import manufacturing_workflow_audit

from typing import List, Literal, Optional
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="Allen Aligner Owner Intelligence",
    version="1.0.0",
    docs_url=None,
    redoc_url=None
)

class Signal(BaseModel):
    category: Literal[
        "FINANCE", "CLINICAL", "PRODUCTION",
        "QUALITY", "STOCK", "MACHINES", "PEOPLE"
    ]
    source_id: str = Field(min_length=1, max_length=128)
    metric: str = Field(min_length=1, max_length=100)
    value: float = Field(allow_inf_nan=False)
    threshold: float = Field(allow_inf_nan=False)
    comparison: Literal["GT", "GTE", "LT", "LTE"]
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    verified: bool = False

class EvaluationRequest(BaseModel):
    signals: List[Signal] = Field(min_length=1, max_length=500)

def triggered(signal: Signal) -> bool:
    if signal.comparison == "GT":
        return signal.value > signal.threshold
    if signal.comparison == "GTE":
        return signal.value >= signal.threshold
    if signal.comparison == "LT":
        return signal.value < signal.threshold
    return signal.value <= signal.threshold

def authorize(key: Optional[str]) -> None:
    expected = os.environ.get("AA_OWNER_ENGINE_KEY", "")

    if not expected or not key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not hmac.compare_digest(key, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "Allen Aligner Owner Intelligence",
        "database": db_health()
    }

@app.post("/evaluate")
def evaluate(
    request: EvaluationRequest,
    x_engine_key: Optional[str] = Header(default=None)
):
    authorize(x_engine_key)

    alerts = []
    unverified = 0

    for signal in request.signals:
        if not signal.verified:
            unverified += 1
            continue

        if triggered(signal):
            alerts.append({
                "category": signal.category,
                "source_id": signal.source_id,
                "metric": signal.metric,
                "value": signal.value,
                "threshold": signal.threshold,
                "severity": signal.severity,
                "status": "TRIGGERED"
            })

    return {
        "signals_received": len(request.signals),
        "unverified_skipped": unverified,
        "alerts": alerts,
        "alert_count": len(alerts)
    }

@app.get("/owner/kpis")
def owner_kpis(
    x_engine_key: Optional[str] = Header(default=None)
):
    authorize(x_engine_key)
    return employee_kpis()

@app.get("/owner/manufacturing-workflow")
def owner_manufacturing_workflow(
    x_engine_key: Optional[str] = Header(default=None)
):
    authorize(x_engine_key)
    return manufacturing_workflow_audit()
from employee_dashboard import router as employee_router
app.include_router(employee_router)
