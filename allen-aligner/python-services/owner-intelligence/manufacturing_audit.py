from datetime import datetime, timezone

from fastapi import HTTPException

from db_metrics import connection


REQUIRED_TABLES = (
    "TreatmentPlanVersionAudit",
    "TreatmentPlan",
    "PortalCase",
    "ClinicalReview",
    "ManufacturingOrder",
    "ManufacturingOrderAudit",
    "ManufacturingOrderMaterial",
    "ManufacturingOrderReservation",
)


def manufacturing_workflow_audit():
    """Read-only integrity report for exact-version approval to production."""
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = ANY(%s)
                    """,
                    (list(REQUIRED_TABLES),),
                )
                available = {row[0] for row in cur.fetchall()}
                missing = [name for name in REQUIRED_TABLES if name not in available]
                if missing:
                    return {
                        "status": "SETUP_REQUIRED",
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                        "missing_tables": missing,
                        "orders_by_status": {},
                        "findings": [],
                        "summary": {"orders_checked": 0, "issue_count": 0},
                    }

                cur.execute(
                    """
                    SELECT status, count(*)::int
                    FROM public."ManufacturingOrder"
                    GROUP BY status
                    ORDER BY status
                    """
                )
                orders_by_status = {status: count for status, count in cur.fetchall()}

                cur.execute(
                    """
                    WITH latest_plan AS (
                      SELECT "caseId", max(version) AS version
                      FROM public."TreatmentPlan"
                      GROUP BY "caseId"
                    ), order_checks AS (
                      SELECT mo.id, mo."orderNumber", mo."caseId", mo."planId",
                             mo."planVersion", mo."approvedDoctorId", mo."approvedAt",
                             mo."artifactSha256", mo.status, mo."materialCheckedAt",
                             mo."materialCheckedBy", mo."materialEvidence",
                             mo."commercialReference", mo."commercialEvidence",
                             mo."commercialCheckedAt", mo."commercialCheckedBy",
                             mo."workCenter", mo."capacityReference", mo."scheduledFor",
                             mo."dueDate", mo."capacityCheckedAt", mo."capacityCheckedBy",
                             mo."queuePosition", mo.currency, mo."materialCost",
                             mo."laborCost", mo."otherCost", mo."totalCost", mo."costedAt",
                             mo."costedBy", p.version AS actual_plan_version, p.decision,
                             p."approvedByDoctorId", lp.version AS latest_version,
                             c.status AS case_status,
                             EXISTS (
                               SELECT 1 FROM public."ClinicalReview" cr
                               WHERE cr."planId" = p.id AND cr.status = 'APPROVED'
                                 AND cr."independenceVerified" = true
                             ) AS internal_review_ok,
                             EXISTS (
                               SELECT 1 FROM public."TreatmentPlanVersionAudit" a
                               WHERE a."planId" = p.id AND a.action = 'DOCTOR_APPROVED'
                                 AND a."actorId" = mo."approvedDoctorId"
                                 AND a.detail->>'decision' = 'APPROVED'
                                 AND a.detail->>'version' = mo."planVersion"::text
                                 AND a.detail->>'artifactSha256' = mo."artifactSha256"
                                 AND a."createdAt" <= mo."approvedAt"
                             ) AS doctor_approval_ok,
                             EXISTS (
                               SELECT 1 FROM public."ManufacturingOrderAudit" a
                               WHERE a."orderId" = mo.id
                                 AND a.action = 'ORDER_GENERATED_FROM_APPROVED_CASE'
                                 AND a."actorId" = mo."approvedDoctorId"
                                 AND a.detail->>'planId' = mo."planId"
                                 AND a.detail->>'planVersion' = mo."planVersion"::text
                                 AND a.detail->>'approvedDoctorId' = mo."approvedDoctorId"
                                 AND a.detail->>'artifactSha256' = mo."artifactSha256"
                             ) AS order_audit_ok,
                             (SELECT count(*)::int FROM public."ManufacturingOrderMaterial" m
                              WHERE m."orderId" = mo.id) AS material_count,
                             (SELECT count(*)::int
                              FROM public."ManufacturingOrderMaterial" m
                              WHERE m."orderId" = mo.id
                                AND m."quantityRequired" > coalesce((
                                  SELECT sum(r."quantityReserved")
                                  FROM public."ManufacturingOrderReservation" r
                                  WHERE r."materialId" = m.id AND r."releaseMovementId" IS NULL
                                ), 0)) AS material_short_count
                      FROM public."ManufacturingOrder" mo
                      JOIN public."TreatmentPlan" p ON p.id = mo."planId"
                      JOIN public."PortalCase" c ON c.id = mo."caseId"
                      JOIN latest_plan lp ON lp."caseId" = c.id
                      WHERE mo.status <> 'SUPERSEDED'
                    ), findings AS (
                      SELECT id, "orderNumber", "planVersion", 'DOCTOR_APPROVAL_EVIDENCE' AS check_name,
                             'Approved-version audit does not match the doctor, version, fingerprint, or approval time.' AS message
                      FROM order_checks WHERE NOT doctor_approval_ok
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'PLAN_VERSION',
                             'Order does not point to the current approved plan version.'
                      FROM order_checks
                      WHERE "planVersion" <> actual_plan_version
                         OR "planVersion" <> latest_version
                         OR decision <> 'APPROVED' OR case_status <> 'APPROVED'
                         OR "approvedDoctorId" IS DISTINCT FROM "approvedByDoctorId"
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'INDEPENDENT_CLINICAL_REVIEW',
                             'No approved independent clinical review is recorded for this plan.'
                      FROM order_checks WHERE NOT internal_review_ok
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'MANUFACTURING_ORDER_AUDIT',
                             'Order generation audit does not match the linked approved version.'
                      FROM order_checks WHERE NOT order_audit_ok
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'MATERIAL_CHECK',
                             'Material gate is incomplete or material reservations are missing.'
                      FROM order_checks
                      WHERE status IN ('COMMERCIAL_CHECK','CAPACITY_CHECK','QUEUED')
                        AND ("materialCheckedAt" IS NULL OR "materialCheckedBy" IS NULL
                             OR length(btrim("materialEvidence")) < 5 OR material_count = 0
                             OR material_short_count > 0)
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'COMMERCIAL_CHECK',
                             'Commercial evidence is incomplete for an order past the commercial gate.'
                      FROM order_checks
                      WHERE status IN ('CAPACITY_CHECK','QUEUED')
                        AND ("commercialCheckedAt" IS NULL OR "commercialCheckedBy" IS NULL
                             OR length(btrim("commercialReference")) < 2
                             OR length(btrim("commercialEvidence")) < 5)
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'CAPACITY_AND_DUE_DATE',
                             'Capacity booking or valid scheduled and due dates are missing.'
                      FROM order_checks
                      WHERE status = 'QUEUED'
                        AND ("capacityCheckedAt" IS NULL OR "capacityCheckedBy" IS NULL
                             OR length(btrim("workCenter")) < 2
                             OR length(btrim("capacityReference")) < 2
                             OR "scheduledFor" IS NULL OR "dueDate" IS NULL
                             OR "dueDate" < "scheduledFor" OR "queuePosition" IS NULL)
                      UNION ALL
                      SELECT id, "orderNumber", "planVersion", 'COSTING',
                             'Costing fields are partially populated or the total does not add up.'
                      FROM order_checks
                      WHERE "costedAt" IS NOT NULL
                        AND ("costedBy" IS NULL OR coalesce(currency, '') !~ '^[A-Z]{3}$'
                             OR "materialCost" IS NULL OR "laborCost" IS NULL
                             OR "otherCost" IS NULL OR "totalCost" IS NULL
                             OR "totalCost" <> "materialCost" + "laborCost" + "otherCost")
                    )
                    SELECT id::text, "orderNumber", "planVersion", check_name, message
                    FROM findings
                    ORDER BY "orderNumber", check_name
                    LIMIT 500
                    """
                )
                findings = [
                    {
                        "order_id": row[0],
                        "order_number": row[1],
                        "plan_version": row[2],
                        "check": row[3],
                        "message": row[4],
                    }
                    for row in cur.fetchall()
                ]

                cur.execute(
                    'SELECT count(*)::int FROM public."ManufacturingOrder" WHERE status <> %s',
                    ("SUPERSEDED",),
                )
                orders_checked = cur.fetchone()[0]

                cur.execute(
                    """
                    SELECT count(*)::int
                    FROM public."TreatmentPlanVersionAudit" a
                    JOIN public."TreatmentPlan" p ON p.id = a."planId"
                    JOIN public."PortalCase" c ON c.id = p."caseId"
                    LEFT JOIN public."ManufacturingOrder" mo ON mo."planId" = p.id
                    WHERE a.action = 'DOCTOR_APPROVED' AND a.detail->>'decision' = 'APPROVED'
                      AND c.status = 'APPROVED'
                      AND p.version = (SELECT max(p2.version) FROM public."TreatmentPlan" p2 WHERE p2."caseId" = p."caseId")
                      AND a.detail->>'artifactSha256' ~ '^[a-f0-9]{64}$'
                      AND mo.id IS NULL
                    """
                )
                approvals_without_order = cur.fetchone()[0]

                cur.execute(
                    'SELECT count(*)::int FROM public."ManufacturingOrder" WHERE status = %s AND "costedAt" IS NULL',
                    ("QUEUED",),
                )
                queued_costing_pending = cur.fetchone()[0]

        return {
            "status": "ISSUES_FOUND" if findings or approvals_without_order else "PASS",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "orders_by_status": orders_by_status,
            "summary": {
                "orders_checked": orders_checked,
                "issue_count": len(findings) + approvals_without_order,
                "current_approvals_without_order": approvals_without_order,
                "queued_costing_pending": queued_costing_pending,
            },
            "findings": findings,
        }
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Manufacturing workflow audit is unavailable; check read-only database access and migration setup.",
        )
