
import { currentHR } from "../../../lib/hr-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const hr = await currentHR().catch(() => null);

  return Response.json(
    {
      canEditEmployees: Boolean(
        hr && hr.role === "HR_ADMIN"
      )
    },
    {
      headers: {
        "Cache-Control": "private, no-store"
      }
    }
  );
}
