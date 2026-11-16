import { redirect } from "next/navigation";
import { currentHR } from "@/app/lib/hr-auth";
import { canIssueOwnerInvitation } from "@/app/lib/owner-role-policy";
import OwnerInvitationManagement from "./owner-invitation-management";

export const dynamic = "force-dynamic";
export default async function OwnerInvitationsPage() {
  const actor = await currentHR();
  if (!actor) redirect("/hr/login");
  if (!canIssueOwnerInvitation(actor.role)) redirect("/hr/login");
  return <OwnerInvitationManagement />;
}
