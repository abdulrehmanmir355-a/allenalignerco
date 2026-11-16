import { redirect } from "next/navigation";
import Link from "next/link";
import { currentHR } from "@/app/lib/hr-auth";
import { canRevokeOwnerInvitation } from "@/app/lib/owner-role-policy";
import PasswordRecoveryManagement from "./password-recovery-management";
export const dynamic="force-dynamic";
export default async function PasswordRecoveryPage(){const actor=await currentHR();if(!actor)redirect("/hr/login");if(!canRevokeOwnerInvitation(actor.role))redirect("/hr/login");return <main style={{maxWidth:1100,margin:"24px auto",padding:20}}><header style={{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}><div><p>ALLEN ALIGNER / HUMAN RESOURCES</p><h1>Password recovery</h1><p>Verify the person through your established HR process before approving a reset.</p></div><Link href="/hr/owner-invitations">Owner invitations</Link></header><PasswordRecoveryManagement/></main>}
