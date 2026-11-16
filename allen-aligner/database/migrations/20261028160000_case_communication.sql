BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "CaseMessage"
 ADD COLUMN IF NOT EXISTS "senderId" text,
 ADD COLUMN IF NOT EXISTS "senderRole" text CHECK ("senderRole" IN ('DOCTOR','INTERNAL')),
 ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'CASE' CHECK(audience IN ('CASE','DOCTOR_INTERNAL')),
 ADD COLUMN IF NOT EXISTS "planId" text REFERENCES "TreatmentPlan"(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS "replyToId" text REFERENCES "CaseMessage"(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS "clientRequestId" uuid,
 ADD COLUMN IF NOT EXISTS "statusAtSend" text,
 ADD COLUMN IF NOT EXISTS "caseFileId" text REFERENCES "CaseFile"(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS "largeFileId" text REFERENCES "LargeClinicalFile"(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS "CaseMessage_request_once" ON "CaseMessage"("caseId","senderRole","senderId","clientRequestId") WHERE "clientRequestId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "CaseMessage_history_cursor" ON "CaseMessage"("caseId","createdAt",id);

CREATE OR REPLACE FUNCTION aa_case_message_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Case communication history is immutable'; END IF;
 -- Serialize all writers, including older clinical/lab endpoints. Transaction-start
 -- timestamps must not place a late-committing message behind the refresh cursor.
 PERFORM 1 FROM "PortalCase" WHERE id=NEW."caseId" FOR UPDATE;
 NEW."createdAt":=greatest((clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3),
   (SELECT max("createdAt")+interval '1 millisecond' FROM "CaseMessage" WHERE "caseId"=NEW."caseId"));
 IF NEW.audience='DOCTOR_INTERNAL' AND (NEW."senderId" IS NULL OR NEW."senderRole" IS NULL OR NEW."clientRequestId" IS NULL) THEN RAISE EXCEPTION 'Authenticated message identity and request reference required'; END IF;
 IF NEW."replyToId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CaseMessage" WHERE id=NEW."replyToId" AND "caseId"=NEW."caseId") THEN RAISE EXCEPTION 'Replies must belong to the same case'; END IF;
 IF NEW."planId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "TreatmentPlan" WHERE id=NEW."planId" AND "caseId"=NEW."caseId") THEN RAISE EXCEPTION 'Plan reference must belong to the same case'; END IF;
 IF NEW."caseFileId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CaseFile" WHERE id=NEW."caseFileId" AND "caseId"=NEW."caseId") THEN RAISE EXCEPTION 'Document must belong to the same case'; END IF;
 IF NEW."largeFileId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "LargeClinicalFile" WHERE id=NEW."largeFileId" AND "caseId"=NEW."caseId") THEN RAISE EXCEPTION 'Document must belong to the same case'; END IF;
 IF NEW."caseFileId" IS NOT NULL AND NEW."largeFileId" IS NOT NULL THEN RAISE EXCEPTION 'Select one document per message'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_case_message_guard ON "CaseMessage";
CREATE TRIGGER aa_case_message_guard BEFORE INSERT OR UPDATE OR DELETE ON "CaseMessage" FOR EACH ROW EXECUTE FUNCTION aa_case_message_guard();
CREATE OR REPLACE FUNCTION aa_case_message_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Case communication history is immutable'; END $$;
DROP TRIGGER IF EXISTS aa_case_message_no_truncate ON "CaseMessage";
CREATE TRIGGER aa_case_message_no_truncate BEFORE TRUNCATE ON "CaseMessage" FOR EACH STATEMENT EXECUTE FUNCTION aa_case_message_no_truncate();
COMMIT;
