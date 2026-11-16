BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF to_regclass('public."InventoryItem"') IS NULL OR to_regclass('public."InventoryLocation"') IS NULL OR to_regclass('public."Supplier"') IS NULL THEN
    RAISE EXCEPTION 'Apply inventory, location hierarchy, and supplier setup before procurement.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public."InventoryRequisition" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requisitionNumber" varchar(32) NOT NULL UNIQUE,
  status varchar(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED')),
  reason varchar(2000) NOT NULL,
  "requestedBy" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "approvedBy" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "decisionNote" varchar(2000) NOT NULL DEFAULT '',
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "decidedAt" timestamptz,
  CHECK (length(btrim(reason)) >= 5),
  CHECK ((status IN ('PENDING_APPROVAL','CANCELLED') AND "decidedAt" IS NULL AND "approvedBy" IS NULL)
      OR (status IN ('APPROVED','REJECTED') AND "decidedAt" IS NOT NULL AND "approvedBy" IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public."InventoryRequisitionLine" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requisitionId" uuid NOT NULL REFERENCES public."InventoryRequisition"(id) ON DELETE RESTRICT,
  "itemId" uuid NOT NULL REFERENCES public."InventoryItem"(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000000),
  "needBy" date,
  note varchar(500) NOT NULL DEFAULT '',
  UNIQUE ("requisitionId","itemId")
);

CREATE TABLE IF NOT EXISTS public."InventoryRFQ" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requisitionId" uuid NOT NULL REFERENCES public."InventoryRequisition"(id) ON DELETE RESTRICT,
  "supplierId" uuid NOT NULL REFERENCES public."Supplier"(id) ON DELETE RESTRICT,
  "quoteReference" varchar(200) NOT NULL DEFAULT '',
  "totalAmount" numeric(14,2) NOT NULL CHECK ("totalAmount" >= 0),
  currency varchar(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  "leadDays" integer CHECK ("leadDays" IS NULL OR "leadDays" BETWEEN 0 AND 3650),
  status varchar(16) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','SELECTED','NOT_SELECTED')),
  note varchar(2000) NOT NULL DEFAULT '',
  "createdBy" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("requisitionId","supplierId")
);

CREATE TABLE IF NOT EXISTS public."InventoryPurchaseOrder" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseOrderNumber" varchar(32) NOT NULL UNIQUE,
  "requisitionId" uuid NOT NULL UNIQUE REFERENCES public."InventoryRequisition"(id) ON DELETE RESTRICT,
  "rfqId" uuid NOT NULL UNIQUE REFERENCES public."InventoryRFQ"(id) ON DELETE RESTRICT,
  "supplierId" uuid NOT NULL REFERENCES public."Supplier"(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','RECEIVED','CANCELLED')),
  "invoiceReference" varchar(200) NOT NULL DEFAULT '',
  "invoiceDate" date,
  "invoiceNote" varchar(1000) NOT NULL DEFAULT '',
  "createdBy" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."InventoryPurchaseOrderLine" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseOrderId" uuid NOT NULL REFERENCES public."InventoryPurchaseOrder"(id) ON DELETE RESTRICT,
  "requisitionLineId" uuid NOT NULL REFERENCES public."InventoryRequisitionLine"(id) ON DELETE RESTRICT,
  "itemId" uuid NOT NULL REFERENCES public."InventoryItem"(id) ON DELETE RESTRICT,
  "orderedQuantity" integer NOT NULL CHECK ("orderedQuantity" BETWEEN 1 AND 1000000000),
  "receivedQuantity" integer NOT NULL DEFAULT 0 CHECK ("receivedQuantity" BETWEEN 0 AND "orderedQuantity"),
  UNIQUE ("purchaseOrderId","itemId")
);

CREATE TABLE IF NOT EXISTS public."InventoryReceipt" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "receiptNumber" varchar(32) NOT NULL UNIQUE,
  "requestId" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "purchaseOrderId" uuid NOT NULL REFERENCES public."InventoryPurchaseOrder"(id) ON DELETE RESTRICT,
  reference varchar(200) NOT NULL DEFAULT '',
  "receivedBy" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "receivedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."InventoryReceipt"
  ADD COLUMN IF NOT EXISTS "requestId" uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReceipt_requestId_key"
  ON public."InventoryReceipt"("requestId");

CREATE TABLE IF NOT EXISTS public."InventoryReceiptLine" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "receiptId" uuid NOT NULL REFERENCES public."InventoryReceipt"(id) ON DELETE RESTRICT,
  "purchaseOrderLineId" uuid NOT NULL REFERENCES public."InventoryPurchaseOrderLine"(id) ON DELETE RESTRICT,
  "itemId" uuid NOT NULL REFERENCES public."InventoryItem"(id) ON DELETE RESTRICT,
  "locationId" uuid NOT NULL REFERENCES public."InventoryLocation"(id) ON DELETE RESTRICT,
  "lotId" uuid REFERENCES public."InventoryLot"(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000000),
  inspection varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (inspection IN ('PENDING','ACCEPTED','REJECTED')),
  "inspectionNote" varchar(2000) NOT NULL DEFAULT '',
  "inspectedBy" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "inspectedAt" timestamptz,
  CHECK ((inspection='PENDING' AND "inspectedBy" IS NULL AND "inspectedAt" IS NULL)
      OR (inspection IN ('ACCEPTED','REJECTED') AND "inspectedBy" IS NOT NULL AND "inspectedAt" IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public."InventoryProcurementAudit" (
  id bigserial PRIMARY KEY,
  "actorId" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "entityType" varchar(24) NOT NULL CHECK ("entityType" IN ('REQUISITION','RFQ','PURCHASE_ORDER','RECEIPT','INSPECTION','INVOICE')),
  "entityId" uuid NOT NULL,
  action varchar(32) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "InventoryProcurementAudit_entity_time_idx"
  ON public."InventoryProcurementAudit"("entityType","entityId",id);

CREATE OR REPLACE FUNCTION public.aa_inventory_procurement_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN RAISE EXCEPTION 'Procurement audit history is append-only'; END
$function$;
DROP TRIGGER IF EXISTS aa_inventory_procurement_audit_immutable ON public."InventoryProcurementAudit";
CREATE TRIGGER aa_inventory_procurement_audit_immutable
  BEFORE UPDATE OR DELETE ON public."InventoryProcurementAudit"
  FOR EACH ROW EXECUTE FUNCTION public.aa_inventory_procurement_audit_immutable();

ALTER TABLE public."InventoryLot"
  ADD COLUMN IF NOT EXISTS "supplierRecordId" uuid REFERENCES public."Supplier"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "purchaseOrderId" uuid REFERENCES public."InventoryPurchaseOrder"(id) ON DELETE RESTRICT;

ALTER TABLE public."InventoryMovement"
  ADD COLUMN IF NOT EXISTS "purchaseOrderId" uuid REFERENCES public."InventoryPurchaseOrder"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "receiptId" uuid REFERENCES public."InventoryReceipt"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "caseId" text REFERENCES public."PortalCase"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "productionReference" varchar(200) NOT NULL DEFAULT '';

ALTER TABLE public."InventoryMovement" ALTER COLUMN kind TYPE varchar(32);
ALTER TABLE public."InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_kind_check";
ALTER TABLE public."InventoryMovement" ADD CONSTRAINT "InventoryMovement_kind_check"
  CHECK (kind IN ('RECEIVE','RECEIVE_QUARANTINE','ISSUE','RESERVE','UNRESERVE','QUARANTINE','RELEASE','REJECT','RETURN','RESTOCK','RETURN_QUARANTINE'));
CREATE INDEX IF NOT EXISTS "InventoryRequisition_status_time_idx" ON public."InventoryRequisition"(status,"requestedAt" DESC);
CREATE INDEX IF NOT EXISTS "InventoryRFQ_requisition_idx" ON public."InventoryRFQ"("requisitionId",status);
CREATE INDEX IF NOT EXISTS "InventoryPO_supplier_time_idx" ON public."InventoryPurchaseOrder"("supplierId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "InventoryReceipt_PO_time_idx" ON public."InventoryReceipt"("purchaseOrderId","receivedAt" DESC);
CREATE INDEX IF NOT EXISTS "InventoryReceiptLine_lot_idx" ON public."InventoryReceiptLine"("lotId") WHERE "lotId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "InventoryMovement_case_trace_idx" ON public."InventoryMovement"("caseId","createdAt" DESC) WHERE "caseId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "InventoryMovement_production_trace_idx" ON public."InventoryMovement"("productionReference") WHERE "productionReference" <> '';

COMMIT;
