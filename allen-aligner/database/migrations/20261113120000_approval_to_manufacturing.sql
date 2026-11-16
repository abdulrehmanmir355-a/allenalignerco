BEGIN;
SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('public."TreatmentPlanVersionAudit"') IS NULL
     OR to_regclass('public."TreatmentPlan"') IS NULL
     OR to_regclass('public."PortalCase"') IS NULL
     OR to_regclass('public."Doctor"') IS NULL
     OR to_regclass('public."ClinicalReview"') IS NULL
     OR to_regclass('public."HRUser"') IS NULL
     OR to_regclass('public."InventoryItem"') IS NULL
     OR to_regclass('public."InventoryStockState"') IS NULL
     OR to_regclass('public."InventoryLocation"') IS NULL
     OR to_regclass('public."InventoryLot"') IS NULL
     OR to_regclass('public."InventoryLocationBalance"') IS NULL
     OR to_regclass('public."InventoryMovement"') IS NULL THEN
    RAISE EXCEPTION 'Apply doctor approval, internal review, HR, and inventory location migrations before manufacturing.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public."ManufacturingOrder" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderNumber" varchar(40) NOT NULL UNIQUE DEFAULT ('MFG-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  "caseId" text NOT NULL REFERENCES public."PortalCase"(id) ON DELETE RESTRICT,
  "planId" text NOT NULL UNIQUE REFERENCES public."TreatmentPlan"(id) ON DELETE RESTRICT,
  "planVersion" integer NOT NULL CHECK ("planVersion" > 0),
  "approvedDoctorId" text NOT NULL REFERENCES public."Doctor"(id) ON DELETE RESTRICT,
  "approvedAt" timestamptz NOT NULL,
  "artifactSha256" varchar(64) NOT NULL CHECK ("artifactSha256" ~ '^[a-f0-9]{64}$'),
  status varchar(24) NOT NULL DEFAULT 'MATERIAL_CHECK'
    CHECK (status IN ('MATERIAL_CHECK','COMMERCIAL_CHECK','CAPACITY_CHECK','QUEUED','SUPERSEDED')),
  "materialCheckedBy" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "materialCheckedAt" timestamptz,
  "materialEvidence" varchar(2000) NOT NULL DEFAULT '',
  "commercialReference" varchar(200) NOT NULL DEFAULT '',
  "commercialEvidence" varchar(2000) NOT NULL DEFAULT '',
  "commercialCheckedBy" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "commercialCheckedAt" timestamptz,
  "workCenter" varchar(120) NOT NULL DEFAULT '',
  "capacityReference" varchar(200) NOT NULL DEFAULT '',
  "scheduledFor" date,
  "dueDate" date,
  "capacityCheckedBy" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "capacityCheckedAt" timestamptz,
  "queuePosition" bigint UNIQUE,
  currency varchar(3),
  "materialCost" numeric(14,2),
  "laborCost" numeric(14,2),
  "otherCost" numeric(14,2),
  "totalCost" numeric(14,2),
  "costedBy" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "costedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (("materialCheckedAt" IS NULL AND "materialCheckedBy" IS NULL) OR ("materialCheckedAt" IS NOT NULL AND "materialCheckedBy" IS NOT NULL AND length(btrim("materialEvidence")) >= 5)),
  CHECK (("commercialCheckedAt" IS NULL AND "commercialCheckedBy" IS NULL) OR ("commercialCheckedAt" IS NOT NULL AND "commercialCheckedBy" IS NOT NULL AND length(btrim("commercialReference")) >= 2 AND length(btrim("commercialEvidence")) >= 5)),
  CHECK (("capacityCheckedAt" IS NULL AND "capacityCheckedBy" IS NULL) OR ("capacityCheckedAt" IS NOT NULL AND "capacityCheckedBy" IS NOT NULL AND length(btrim("workCenter")) >= 2 AND length(btrim("capacityReference")) >= 2 AND "scheduledFor" IS NOT NULL AND "dueDate" IS NOT NULL AND "dueDate" >= "scheduledFor")),
  CHECK (("queuePosition" IS NULL) OR (status IN ('QUEUED','SUPERSEDED') AND "capacityCheckedAt" IS NOT NULL)),
  CHECK (("costedAt" IS NULL AND "costedBy" IS NULL AND currency IS NULL AND "materialCost" IS NULL AND "laborCost" IS NULL AND "otherCost" IS NULL AND "totalCost" IS NULL)
      OR ("costedAt" IS NOT NULL AND "costedBy" IS NOT NULL AND currency IS NOT NULL AND currency ~ '^[A-Z]{3}$' AND "materialCost" IS NOT NULL AND "materialCost" >= 0 AND "laborCost" IS NOT NULL AND "laborCost" >= 0 AND "otherCost" IS NOT NULL AND "otherCost" >= 0 AND "totalCost" IS NOT NULL AND "totalCost" = "materialCost" + "laborCost" + "otherCost")),
  CHECK ((status IN ('MATERIAL_CHECK','SUPERSEDED')) OR "materialCheckedAt" IS NOT NULL),
  CHECK ((status IN ('MATERIAL_CHECK','COMMERCIAL_CHECK','SUPERSEDED')) OR "commercialCheckedAt" IS NOT NULL),
  CHECK ((status IN ('MATERIAL_CHECK','COMMERCIAL_CHECK','CAPACITY_CHECK','SUPERSEDED')) OR "capacityCheckedAt" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ManufacturingOrder_status_queue_idx"
  ON public."ManufacturingOrder"(status,"queuePosition","dueDate","createdAt");
CREATE INDEX IF NOT EXISTS "ManufacturingOrder_case_idx"
  ON public."ManufacturingOrder"("caseId","planVersion" DESC);

CREATE TABLE IF NOT EXISTS public."ManufacturingOrderMaterial" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" uuid NOT NULL REFERENCES public."ManufacturingOrder"(id) ON DELETE RESTRICT,
  "itemId" uuid NOT NULL REFERENCES public."InventoryItem"(id) ON DELETE RESTRICT,
  "quantityRequired" integer NOT NULL CHECK ("quantityRequired" BETWEEN 1 AND 1000000000),
  UNIQUE ("orderId","itemId")
);

CREATE TABLE IF NOT EXISTS public."ManufacturingOrderReservation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" uuid NOT NULL REFERENCES public."ManufacturingOrder"(id) ON DELETE RESTRICT,
  "materialId" uuid NOT NULL REFERENCES public."ManufacturingOrderMaterial"(id) ON DELETE RESTRICT,
  "movementId" uuid NOT NULL UNIQUE REFERENCES public."InventoryMovement"(id) ON DELETE RESTRICT,
  "quantityReserved" integer NOT NULL CHECK ("quantityReserved" > 0),
  "releaseMovementId" uuid UNIQUE REFERENCES public."InventoryMovement"(id) ON DELETE RESTRICT,
  UNIQUE ("materialId","movementId")
);
ALTER TABLE public."ManufacturingOrderReservation"
  ADD COLUMN IF NOT EXISTS "releaseMovementId" uuid UNIQUE REFERENCES public."InventoryMovement"(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public."ManufacturingOrderAudit" (
  id bigserial PRIMARY KEY,
  "orderId" uuid NOT NULL REFERENCES public."ManufacturingOrder"(id) ON DELETE RESTRICT,
  action varchar(40) NOT NULL,
  "actorId" text NOT NULL,
  "actorName" varchar(200) NOT NULL,
  "actorRole" varchar(40) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ManufacturingOrderAudit_order_time_idx"
  ON public."ManufacturingOrderAudit"("orderId",id);
CREATE OR REPLACE FUNCTION public.aa_manufacturing_order_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN RAISE EXCEPTION 'Manufacturing order audit history is append-only'; END
$function$;
DROP TRIGGER IF EXISTS aa_manufacturing_order_audit_immutable ON public."ManufacturingOrderAudit";
CREATE TRIGGER aa_manufacturing_order_audit_immutable
  BEFORE UPDATE OR DELETE ON public."ManufacturingOrderAudit"
  FOR EACH ROW EXECUTE FUNCTION public.aa_manufacturing_order_audit_immutable();

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
DROP TRIGGER IF EXISTS aa_create_manufacturing_order_after_doctor_approval ON public."TreatmentPlanVersionAudit";
CREATE TRIGGER aa_create_manufacturing_order_after_doctor_approval
  AFTER INSERT ON public."TreatmentPlanVersionAudit"
  FOR EACH ROW EXECUTE FUNCTION public.aa_create_manufacturing_order_after_doctor_approval();

-- Existing current approved cases enter the same queue once; earlier revisions and completed cases do not.
INSERT INTO public."ManufacturingOrder"("caseId","planId","planVersion","approvedDoctorId","approvedAt","artifactSha256")
SELECT p."caseId",p.id,p.version,a."actorId",
  CASE
    WHEN a.detail->>'approvedAt' ~ '^\d{4}-\d{2}-\d{2}T.*$' THEN (a.detail->>'approvedAt')::timestamptz
    ELSE a."createdAt"
  END,
  a.detail->>'artifactSha256'
FROM public."TreatmentPlanVersionAudit" a
JOIN public."TreatmentPlan" p ON p.id=a."planId"
JOIN public."PortalCase" c ON c.id=p."caseId"
WHERE a.action='DOCTOR_APPROVED' AND a.detail->>'decision'='APPROVED'
  AND p.decision='APPROVED'
  AND p."approvedByDoctorId"=a."actorId"
  AND p.version=(SELECT max(p2.version) FROM public."TreatmentPlan" p2 WHERE p2."caseId"=p."caseId")
  AND c.status='APPROVED'
  AND EXISTS (
    SELECT 1 FROM public."ClinicalReview" r
    WHERE r."planId"=p.id AND r.status='APPROVED' AND r."independenceVerified"
  )
  AND a.detail->>'artifactSha256' ~ '^[a-f0-9]{64}$'
ON CONFLICT ("planId") DO NOTHING;

COMMIT;
