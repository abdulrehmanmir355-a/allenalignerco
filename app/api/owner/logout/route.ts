import { sameOrigin } from "@/app/lib/portal-auth";
import { endOwnerSession } from "@/app/lib/owner-auth";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  await endOwnerSession();
  return new Response(null, { status: 303, headers: { Location: "/owner-login", "Cache-Control": "no-store" } });
}
