import { z } from 'zod';
import { hash } from 'bcryptjs';

// bcrypt serializes to exactly 60 ASCII characters; supported work factors are 04–31.
const bcryptPattern = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;
export function isBcryptHash(value: unknown): value is string {
  return typeof value === 'string' && bcryptPattern.test(value);
}
export const newPasswordSchema = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Use a password of at most 72 UTF-8 bytes.');
export async function hashNewPassword(plaintext: string) {
  // This function takes a user's new password, never an existing passwordHash.
  return hash(newPasswordSchema.parse(plaintext), 12);
}
export function assertPasswordHashWrite(table: string, data: Record<string, unknown>) {
  if (table === 'Doctor' && data.passwordHash !== undefined && !isBcryptHash(data.passwordHash)) {
    throw new Error('Doctor.passwordHash requires a bcrypt hash. Use hashNewPassword for new passwords.');
  }
}
