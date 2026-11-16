
BEGIN;

-- Database-controlled Clinical Registration Approval
-- This function must be installed by a dedicated DB administrator.
-- It does not grant access to the application or PUBLIC roles.

CREATE FUNCTION aa_clinical_db_registration_decide(
    p_account_id uuid,
    p_request_id uuid,
    p_decision text,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request jsonb;
    v_updated jsonb;
    v_existing_role text;
    v_account_role text;
    v_active boolean;
    v_change_password boolean;
    v_identity_status text;
    v_requested_role text;
    v_approved boolean;
BEGIN
    IF p_account_id IS NULL OR p_request_id IS NULL
       OR p_decision IS NULL
       OR p_decision NOT IN ('APPROVE', 'REJECT')
       OR p_reason IS NULL
       OR length(btrim(p_reason)) < 10
       OR length(btrim(p_reason)) > 2000
    THEN
        RAISE EXCEPTION 'Invalid approval request';
    END IF;

    SELECT
        w."clinicalRequest",
        w."clinicalRole",
        w.role,
        w."isActive",
        w."mustChangePassword",
        e.status
    INTO
        v_request,
        v_existing_role,
        v_account_role,
        v_active,
        v_change_password,
        v_identity_status
    FROM "WorkAccount" w
    JOIN "ClinicalIdentity" e
      ON e."accountId" = w.id
    WHERE w.id = p_account_id
    FOR UPDATE OF w;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Clinical account not found';
    END IF;

    IF v_request IS NULL
       OR v_request->>'status' IS DISTINCT FROM 'PENDING'
       OR v_request->>'id' IS DISTINCT FROM p_request_id::text
    THEN
        RAISE EXCEPTION 'Request already decided or changed';
    END IF;

    v_requested_role := v_request->>'role';

    IF v_requested_role IS NULL
       OR v_requested_role NOT IN ('REVIEWER', 'LEAD')
       OR (v_account_role = 'CLINICAL_ONLY'
           AND v_requested_role <> 'REVIEWER')
    THEN
        RAISE EXCEPTION 'Requested clinical role is not permitted';
    END IF;

    IF v_existing_role IS NOT NULL THEN
        RAISE EXCEPTION 'Clinical permission already exists';
    END IF;

    v_approved := p_decision = 'APPROVE';

    IF v_approved AND (
        NOT coalesce(v_active, false)
        OR v_identity_status IS DISTINCT FROM 'ACTIVE'
        OR coalesce(v_change_password, true)
    ) THEN
        RAISE EXCEPTION 'Account activation and identity verification required';
    END IF;

    v_updated := v_request || jsonb_build_object(
        'status', CASE WHEN v_approved THEN 'APPROVED' ELSE 'REJECTED' END,
        'decidedAt', clock_timestamp(),
        'decidedBy', session_user,
        'decidedByRole', 'DATABASE_ADMIN',
        'decisionSource', 'DATABASE_ADMIN_SQL',
        'decisionReason', btrim(p_reason)
    );

    UPDATE "WorkAccount"
    SET
        "clinicalRequest" = v_updated,
        "clinicalRole" = CASE
            WHEN v_approved THEN v_requested_role
            ELSE NULL
        END
    WHERE id = p_account_id;

    INSERT INTO "ClinicalReviewAudit" (
        "actorId", "actorName", action, detail
    )
    VALUES (
        session_user,
        session_user,
        'DATABASE_CLINICAL_REGISTRATION_DECISION',
        jsonb_build_object(
            'accountId', p_account_id,
            'requestId', p_request_id,
            'source', 'DATABASE_ADMIN_SQL',
            'decision', p_decision,
            'reason', btrim(p_reason),
            'before', v_request,
            'after', v_updated
        )
    );

    RETURN jsonb_build_object(
        'status', v_updated->>'status',
        'accountId', p_account_id,
        'requestId', p_request_id,
        'approvedBy', session_user
    );
END;
$$;

-- PostgreSQL functions normally allow PUBLIC execution.
-- Explicitly remove that default permission.
REVOKE ALL ON FUNCTION
aa_clinical_db_registration_decide(uuid, uuid, text, text)
FROM PUBLIC;

-- No GRANT to Netlify's application database role.

COMMIT;
