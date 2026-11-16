
import type { Pool, PoolClient } from "pg";

import {
  parseNewCrmLead,
} from "./crm-lead-validation";

import {
  requireCrmContext,
  type CrmPrincipal,
} from "./crm-access";

type CrmDatabase = Pool | PoolClient;

type CreatedLead = {
  id: string;
  lead_name: string;
  customer_type: string;
  stage: string;
};

export async function createCrmLead(
  database: CrmDatabase,
  authenticatedPrincipal: CrmPrincipal | null,
  input: unknown
): Promise<CreatedLead> {
  // Identity must come from trusted server authentication.
  const actor = requireCrmContext(
    authenticatedPrincipal,
    "crm:write"
  );

  const lead = parseNewCrmLead(input);

  const result = await database.query<CreatedLead>(
    `
    INSERT INTO public.crm_leads (
      account_id,
      lead_name,
      customer_type,
      company_name,
      country,
      email,
      phone,
      website,
      lead_source,
      notes,
      stage,
      assigned_to
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, 'NEW', $11
    )
    RETURNING
      id::text AS id,
      lead_name,
      customer_type,
      stage
    `,
    [
      actor.accountId,
      lead.lead_name,
      lead.customer_type,
      lead.company_name,
      lead.country,
      lead.email,
      lead.phone,
      lead.website,
      lead.lead_source,
      lead.notes,
      actor.userId,
    ]
  );

  if (!result.rows[0]) {
    throw new Error("CRM_LEAD_CREATE_FAILED");
  }

  return result.rows[0];
}
