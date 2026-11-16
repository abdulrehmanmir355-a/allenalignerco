"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { assignClinicalCase } from "@/app/lib/clinical-case-assignment";
import { PortalError } from "@/app/lib/portal-http";

export async function assignCase(form: FormData) {
  let result = "failed";
  const caseId = String(form.get("caseId") ?? "").trim();
  try {
    const actor = await clinicalActor();
    const revision = String(form.get("revision") ?? "");
    if (!/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision))) {
      result = "invalid";
    } else {
      await assignClinicalCase(actor, {
        caseId,
        assignedTo: String(form.get("assignedTo") ?? ""),
        revision: Number(revision),
        reason: String(form.get("reason") ?? ""),
      });
      revalidatePath("/clinical/leader");
      revalidatePath("/clinical/communications");
      revalidatePath(`/clinical/cases/${encodeURIComponent(caseId)}/communication`);
      result = "assigned";
    }
  } catch (error) {
    if (error instanceof PortalError) {
      result = error.status === 409 ? "stale" : error.status === 400 ? "invalid" : [401, 403, 404].includes(error.status) ? "denied" : "failed";
    } else {
      console.error("Leader case assignment failed:", error);
    }
  }
  redirect(`/clinical/leader?result=${result}`);
}
