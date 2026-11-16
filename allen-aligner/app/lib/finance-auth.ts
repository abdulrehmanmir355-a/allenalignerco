import "server-only";

/**
 * Finance access is intentionally disabled in this Cloudflare deployment.
 * The existing finance login is localhost-only and depends on local disk.
 * Keep all production payroll routes unauthenticated and inaccessible until
 * a production-ready identity provider is configured.
 */
export async function currentFinance(): Promise<null> {
  return null;
}

export async function financeActionActor(): Promise<null> {
  return null;
}
