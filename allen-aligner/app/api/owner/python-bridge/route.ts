import { NextResponse } from "next/server";
import { currentOwner } from "../../../lib/owner-auth";
export const dynamic = "force-dynamic";
const BASE = process.env.AA_OWNER_PYTHON_BASE_URL ?? "http://127.0.0.1:8100";
async function requestPython(
  path: string,
  headers: Record<string, string> = {}
) {
  try {
    const response = await fetch(BASE + path, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Python returned HTTP ${response.status}`,
      };
    }
    const data: unknown = await response.json();
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      message: "Python service unavailable or response invalid",
    };
  }
}
export async function GET() {
  const actor = await currentOwner();
  if (!actor) return NextResponse.json({ message: "Owner access required" }, { status: 403 });
  const apiKey = process.env.AA_OWNER_ENGINE_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-Engine-Key"] = apiKey;
  }
  const health = await requestPython("/health");
  const kpis = apiKey
    ? await requestPython("/owner/kpis", headers)
    : {
        ok: false,
        message: "Python API key not configured in Next.js",
      };
  return NextResponse.json(
    {
      health,
      kpis,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
