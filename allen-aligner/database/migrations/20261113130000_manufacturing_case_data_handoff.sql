BEGIN;
SET LOCAL lock_timeout='10s';

DO $guard$
BEGIN
  IF to_regclass('public."ManufacturingOrder"') IS NULL
     OR to_regclass('public."ManufacturingOrderAudit"') IS NULL
     OR to_regclass('public."TreatmentPlanVersionAudit"') IS NULL THEN
    RAISE EXCEPTION 'Apply the manufacturing-order setup before the approved-case handoff.';
  END IF;
END
$guard$;

-- The order reuses its immutable case and approved-plan links; it does not create
-- a second copy of the clinical record or ask staff to re-enter case details.
CREATE OR REPLACE FUNCTION public.aa_create_manufacturing_order_after_doctor_approval()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE p public."TreatmentPlan"%ROWTYPE; approved_at timestamptz; old_order record; created_order_id uuid;
BEGIN
  IF NEW.action NOT IN ('VERSION_CREATED','DOCTOR_APPROVED') THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public."TreatmentPlan" WHERE id=NEW."planId";
  IF NOT FOUND OR p.version <> (SELECT max(version) FROM public."TreatmentPlan" WHERE "caseId"=p."caseId") THEN RETURN NEW; END IF;
  FOR old_order IN UPDATE public."ManufacturingOrder" SET status='SUPERSEDED'
    WHERE "caseId"=p."caseId" AND "planVersion"<p.version AND status<>'SUPERSEDED'
    RETURNING id,"orderNumber","planVersion"
  LOOP
    INSERT INTO public."ManufacturingOrderAudit"("orderId",action,"actorId","actorName","actorRole",detail)
    VALUES(old_order.id,'PLAN_VERSION_SUPERSEDED',NEW."actorId",NEW."actorName",NEW."actorRole",
      jsonb_build_object('supersededByVersion',p.version,'previousVersion',old_order."planVersion"));
  END LOOP;
  IF NEW.action <> 'DOCTOR_APPROVED' OR NEW.detail->>'decision' <> 'APPROVED' THEN RETURN NEW; END IF;
  IF p.decision IS DISTINCT FROM 'APPROVED'
     OR p."approvedByDoctorId" IS DISTINCT FROM NEW."actorId"
     OR coalesce(NEW.detail->>'artifactSha256','') !~ '^[a-f0-9]{64}$'
     OR NOT EXISTS (
       SELECT 1 FROM public."ClinicalReview" r
       WHERE r."planId"=p.id AND r.status='APPROVED' AND r."independenceVerified"
     ) THEN
    RAISE EXCEPTION 'Manufacturing requires the current independently reviewed plan and its exact doctor approval';
  END IF;
  approved_at := coalesce(p."approvedAt", NEW."createdAt");
  INSERT INTO public."ManufacturingOrder"("caseId","planId","planVersion","approvedDoctorId","approvedAt","artifactSha256")
  VALUES(p."caseId",p.id,p.version,NEW."actorId",approved_at,NEW.detail->>'artifactSha256')
  ON CONFLICT ("planId") DO NOTHING RETURNING id INTO created_order_id;
  IF created_order_id IS NOT NULL THEN
    INSERT INTO public."ManufacturingOrderAudit"("orderId",action,"actorId","actorName","actorRole",detail)
    SELECT created_order_id,'ORDER_GENERATED_FROM_APPROVED_CASE',NEW."actorId",NEW."actorName",NEW."actorRole",
      jsonb_build_object('caseId',c.id,'patientReference',c."patientReference",'caseType',c.category,'clinicId',c."clinicId",
        'planId',p.id,'planVersion',p.version,'approvedDoctorId',NEW."actorId",'approvedAt',approved_at,
        'artifactSha256',NEW.detail->>'artifactSha256','sourceFileIds',coalesce((SELECT jsonb_agg(coalesce(f."caseFileId",f."largeFileId") ORDER BY f.id) FROM public."TreatmentPlanFile" f WHERE f."planId"=p.id),'[]'::jsonb))
    FROM public."PortalCase" c WHERE c.id=p."caseId";
  END IF;
  RETURN NEW;
END
$function$;

-- Record existing orders once, while keeping the clinical source linked instead
-- of copying names, histories, files, or other patient data into manufacturing.
INSERT INTO public."ManufacturingOrderAudit"("orderId",action,"actorId","actorName","actorRole",detail,"createdAt")
SELECT mo.id,'ORDER_GENERATED_FROM_APPROVED_CASE',mo."approvedDoctorId",d."fullName",'DOCTOR',
  jsonb_build_object('caseId',c.id,'patientReference',c."patientReference",'caseType',c.category,'clinicId',c."clinicId",
    'planId',p.id,'planVersion',mo."planVersion",'approvedDoctorId',mo."approvedDoctorId",'approvedAt',mo."approvedAt",
    'artifactSha256',mo."artifactSha256",'sourceFileIds',coalesce((SELECT jsonb_agg(coalesce(f."caseFileId",f."largeFileId") ORDER BY f.id) FROM public."TreatmentPlanFile" f WHERE f."planId"=p.id),'[]'::jsonb),
    'importedFromExistingOrder',true),mo."createdAt"
FROM public."ManufacturingOrder" mo
JOIN public."PortalCase" c ON c.id=mo."caseId"
JOIN public."TreatmentPlan" p ON p.id=mo."planId"
JOIN public."Doctor" d ON d.id=mo."approvedDoctorId"
WHERE NOT EXISTS (SELECT 1 FROM public."ManufacturingOrderAudit" a WHERE a."orderId"=mo.id AND a.action='ORDER_GENERATED_FROM_APPROVED_CASE');

COMMIT;
