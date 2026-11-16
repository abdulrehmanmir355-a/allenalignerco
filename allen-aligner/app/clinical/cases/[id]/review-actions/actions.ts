"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { clinicalUpdate } from "@/app/lib/clinical-service";
import { planningQueueUrl } from "@/app/lib/planning-queue";
import { PortalError } from "@/app/lib/portal-http";

function field(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

async function execute(
  form: FormData,
  action: "assign" | "start"
) {
  const caseId = field(form, "caseId");
  const planId = field(form, "planId");
  const rawRevision = field(form, "revision");
  const revision = Number(rawRevision);

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(caseId)) {
    redirect("/clinical/work-queue");
  }

  const caseUrl = `/clinical/cases/${encodeURIComponent(caseId)}/review-actions`;
  let returnTo = caseUrl;
  try {
    const requested = new URL(field(form,"returnTo"),"http://queue.local");
    if(requested.origin==='http://queue.local' && requested.pathname==='/clinical/assignment-board') {
      returnTo=planningQueueUrl(requested.searchParams.get('filter')||'ALL',Number(requested.searchParams.get('page')||1));
    }
  } catch { /* Invalid return targets use the authorized case workspace. */ }
  const url = returnTo;
  const separator=url.includes('?')?'&':'?';

  if (
    !planId ||
    planId.length > 128 ||
    !/^\d+$/.test(rawRevision) || !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    redirect(`${url}${separator}result=invalid`);
  }

  let success = false;
  let failure = "failed";

  try {
    const actor = await clinicalActor();

    if (action === "assign") {
      const assignedTo = field(form, "assignedTo");
      const priority = field(form, "priority");
      const dueDate = field(form, "dueDate");
      const reason = field(form, "reason");

      if (
        assignedTo &&
        priority &&
        assignedTo.length <= 128 &&
        priority.length <= 32 &&
        (!dueDate || /^\d{4}-\d{2}-\d{2}$/.test(dueDate))
      ) {
        await clinicalUpdate(actor, caseId, {
          action: "assign",
          planId,
          revision,
          assignedTo,
          priority,
          dueDate,
          ...(reason ? { reason } : {})
        });
        success = true;
      }
    } else {
      await clinicalUpdate(actor, caseId, {
        action: "start",
        planId,
        revision
      });
      success = true;
    }
  } catch (error) {
    if(returnTo.startsWith('/clinical/assignment-board') && error instanceof PortalError) {
      failure=error.status===409?'stale':error.status===400?'invalid':[401,403,404].includes(error.status)?'denied':'failed';
    }
    if(!(error instanceof PortalError))console.error("Clinical review action failed:", error);
  }

  if (!success) redirect(`${url}${separator}result=${failure}`);

  revalidatePath(`/clinical/cases/${caseId}`);
  revalidatePath("/clinical/assignment-board");
  revalidatePath("/clinical/work-queue");

  redirect(`${url}${separator}result=${action === "assign" ? "assigned" : "started"}`);
}

export async function assignReviewer(form: FormData) {
  await execute(form, "assign");
}

export async function startReview(form: FormData) {
  await execute(form, "start");
}
