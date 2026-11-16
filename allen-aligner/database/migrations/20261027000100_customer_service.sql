BEGIN;
CREATE TABLE IF NOT EXISTS allen_service_staff (
 account_kind text NOT NULL CHECK(account_kind IN ('HR','WORK')), account_id text NOT NULL,
 role text NOT NULL CHECK(role IN ('AGENT','SUPERVISOR')), active boolean NOT NULL DEFAULT true,
 granted_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_kind,account_id)
);
CREATE TABLE IF NOT EXISTS allen_service_policy (
 id uuid PRIMARY KEY, priority text NOT NULL CHECK(priority IN ('P1','P2','P3','P4')),
 response_minutes integer NOT NULL CHECK(response_minutes BETWEEN 1 AND 525600),
 resolution_minutes integer NOT NULL CHECK(resolution_minutes BETWEEN 1 AND 525600),
 activated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allen_service_ticket (
 id uuid PRIMARY KEY, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 clinic_id text REFERENCES "Clinic"(id), case_id text REFERENCES "PortalCase"(id),
 requester_id text NOT NULL, requester_kind text NOT NULL CHECK(requester_kind IN ('DOCTOR','CLINIC','HR','WORK')),
 requester_name text NOT NULL, subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 180),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 10000), category text NOT NULL,
 impact text NOT NULL CHECK(impact IN ('HIGH','MEDIUM','LOW')), urgency text NOT NULL CHECK(urgency IN ('IMMEDIATE','TIME_SENSITIVE','ROUTINE')),
 priority text NOT NULL CHECK(priority IN ('P1','P2','P3','P4')),
 state text NOT NULL DEFAULT 'NEW' CHECK(state IN ('NEW','IN_PROGRESS','WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED','CLOSED','CANCELLED')),
 team text NOT NULL DEFAULT 'Customer Service', owner_id text, owner_kind text,
 cycle_started_at timestamptz NOT NULL DEFAULT now(), cycle integer NOT NULL DEFAULT 1, version integer NOT NULL DEFAULT 1,
 quality_flag boolean NOT NULL DEFAULT false, quality_assessment text,
 resolution text, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((owner_id IS NULL)=(owner_kind IS NULL)),
 CHECK(state NOT IN ('IN_PROGRESS','WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED','CLOSED') OR owner_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS allen_service_message (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES allen_service_ticket(id), author_id text NOT NULL,
 author_kind text NOT NULL, author_name text NOT NULL, audience text NOT NULL CHECK(audience IN ('PUBLIC','INTERNAL')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 10000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allen_service_sla (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES allen_service_ticket(id), cycle integer NOT NULL,
 metric text NOT NULL CHECK(metric IN ('RESPONSE','RESOLUTION')), policy_id uuid NOT NULL REFERENCES allen_service_policy(id),
 started_at timestamptz NOT NULL, due_at timestamptz NOT NULL, completed_at timestamptz, breached_at timestamptz,
 outcome text CHECK(outcome IN ('SUCCESS','CANCELLED')), UNIQUE(ticket_id,cycle,metric)
);
CREATE TABLE IF NOT EXISTS allen_service_escalation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES allen_service_ticket(id),
 sla_id uuid REFERENCES allen_service_sla(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_by text, acknowledged_at timestamptz, UNIQUE(sla_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS allen_service_quality_once ON allen_service_escalation(ticket_id) WHERE reason='Quality review required';
CREATE TABLE IF NOT EXISTS allen_service_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ticket_id uuid REFERENCES allen_service_ticket(id),
 actor_id text NOT NULL, actor_kind text NOT NULL, action text NOT NULL, reason text NOT NULL,
 before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allen_service_intake (
 actor_id text NOT NULL, actor_kind text NOT NULL, intake_key uuid NOT NULL, payload_hash text NOT NULL,
 ticket_id uuid NOT NULL REFERENCES allen_service_ticket(id), PRIMARY KEY(actor_id,actor_kind,intake_key)
);
CREATE INDEX IF NOT EXISTS allen_service_queue ON allen_service_ticket(state,priority,updated_at DESC);
CREATE INDEX IF NOT EXISTS allen_service_requester ON allen_service_ticket(requester_id,requester_kind,clinic_id);
CREATE INDEX IF NOT EXISTS allen_service_owner ON allen_service_ticket(owner_id,owner_kind,state);
CREATE INDEX IF NOT EXISTS allen_service_due ON allen_service_sla(due_at) WHERE completed_at IS NULL AND outcome IS NULL;
CREATE INDEX IF NOT EXISTS allen_service_message_ticket ON allen_service_message(ticket_id,created_at);
CREATE OR REPLACE FUNCTION aa_service_refresh() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('allen-service-clock',0));
 WITH due AS (
  UPDATE allen_service_sla s SET breached_at=s.due_at
  WHERE s.breached_at IS NULL AND s.outcome IS DISTINCT FROM 'CANCELLED'
   AND ((s.completed_at IS NULL AND s.due_at<=now()) OR s.completed_at>s.due_at)
  RETURNING s.id,s.ticket_id,s.metric
 ), escalated AS (
  INSERT INTO allen_service_escalation(ticket_id,sla_id,reason)
  SELECT ticket_id,id,metric || ' target missed' FROM due ON CONFLICT(sla_id) DO NOTHING
  RETURNING ticket_id,reason
 )
 INSERT INTO allen_service_audit(ticket_id,actor_id,actor_kind,action,reason)
 SELECT ticket_id,'sla-worker','SYSTEM','SLA_BREACH',reason FROM escalated;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
COMMIT;
