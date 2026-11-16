
BEGIN;

SET LOCAL lock_timeout = '5s';

-- Allen Aligner
-- Database-controlled Clinical ADMIN appointment/removal.
-- Installation and role permissions must be verified
-- before execution on Neon.

CREATE FUNCTION public.aa_clinical_db_admin_change(
    p_employee_id text,
    p_action text,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_employee record;
    v_new_role text;
    v_actor text;
BEGIN
    IF p_employee_id IS NULL
       OR length(btrim(p_employee_id)) < 3
       OR length(btrim(p_employee_id)) > 254
       OR p_action IS NULL
       OR p_action NOT IN ('APPOINT', 'REMOVE')
       OR p_reason IS NULL
       OR length(btrim(p_reason)) < 10
       OR length(btrim(p_reason)) > 2000
    THEN
        RAISE EXCEPTION 'Invalid ADMIN appointment request';
    END IF;

    SELECT
        w.id,
        w.role,
        w."clinicalRole",
        w."clinicalRequest",
        w."isActive",
        w."mustChangePassword",
        e.status AS "identityStatus",
        e."permanentId",
        e."fullName"
    INTO v_employee
    FROM public."WorkAccount" w
    JOIN public."ClinicalIdentity" e
        ON e."accountId" = w.id
    WHERE e."permanentId" = btrim(p_employee_id)
    FOR UPDATE OF w;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Clinical employee not found';
    END IF;

    IF p_action = 'APPOINT' THEN

        IF v_employee.role = 'CLINICAL_ONLY' THEN
            RAISE EXCEPTION
                'Standalone reviewer cannot become ADMIN';
        END IF;

        IF NOT coalesce(v_employee."isActive", false)
           OR v_employee."identityStatus" IS DISTINCT FROM 'ACTIVE'
           OR coalesce(v_employee."mustChangePassword", true)
        THEN
            RAISE EXCEPTION
                'Employee activation and identity verification required';
        END IF;

        IF v_employee."clinicalRole" = 'ADMIN' THEN
            RAISE EXCEPTION 'Already a Clinical Administrator';
        END IF;

        IF v_employee."clinicalRequest"->>'status' = 'PENDING' THEN
            RAISE EXCEPTION
                'Resolve pending registration before appointment';
        END IF;

        v_new_role := 'ADMIN';

    ELSE

        IF v_employee."clinicalRole" IS DISTINCT FROM 'ADMIN' THEN
            RAISE EXCEPTION 'Employee does not have ADMIN access';
        END IF;

        v_new_role := NULL;

    END IF;

    v_actor := session_user;

    UPDATE public."WorkAccount"
    SET "clinicalRole" = v_new_role
    WHERE id = v_employee.id;

    INSERT INTO public."ClinicalReviewAudit" (
        "actorId",
        "actorName",
        action,
        detail
    )
    VALUES (
        v_actor,
        v_actor,
        CASE
            WHEN p_action = 'APPOINT'
            THEN 'DATABASE_CLINICAL_ADMIN_APPOINTED'
            ELSE 'DATABASE_CLINICAL_ADMIN_REMOVED'
        END,
        jsonb_build_object(
            'accountId', v_employee.id,
            'employeeId', v_employee."permanentId",
            'employeeName', v_employee."fullName",
            'before', v_employee."clinicalRole",
            'after', v_new_role,
            'source', 'DATABASE_ADMIN',
            'loginRole', session_user,
            'effectiveRole', current_user,
            'reason', btrim(p_reason),
            'recordedAt', clock_timestamp()
        )
    );

    RETURN jsonb_build_object(
        'employeeId', v_employee."permanentId",
        'previousRole', v_employee."clinicalRole",
        'newRole', v_new_role,
        'action', p_action,
        'databaseActor', v_actor
    );
END;
$$;

-- No general database role should be allowed to execute.
REVOKE ALL ON FUNCTION
    public.aa_clinical_db_admin_change(text, text, text)
FROM PUBLIC;

-- Do not grant execution to the Netlify application role.
-- A separately authorized database role must be configured.

COMMIT;
