import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newToken() {
  return randomBytes(32).toString("hex");
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, stored: unknown) {
  if (typeof stored !== "string" || !/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(stored)) return false;
  return timingSafeEqual(Buffer.from(tokenHash(token), "hex"), Buffer.from(stored, "hex"));
}
