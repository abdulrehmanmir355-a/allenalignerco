export type OffboardingInput = {
  employeeId: string;
  exitType: string;
  lastWorkingDay: string;
  reason: string;
};

export function validateOffboardingInput(value: unknown) {
  const raw: Record<string, unknown> =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const read = (key: string) =>
    typeof raw[key] === "string" ? raw[key].trim() : "";

  const data: OffboardingInput = {
    employeeId: read("employeeId"),
    exitType: read("exitType"),
    lastWorkingDay: read("lastWorkingDay"),
    reason: read("reason"),
  };

  const errors: Record<string, string> = {};

  if (!data.employeeId) errors.employeeId = "Employee is required.";
  if (!data.exitType) errors.exitType = "Exit type is required.";
  if (!data.reason) errors.reason = "Reason is required.";
  if (data.reason.length > 1000) errors.reason = "Reason is too long.";

  const date = data.lastWorkingDay;
  const parsed = new Date(date + "T00:00:00.000Z");

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    errors.lastWorkingDay = "A valid working date is required.";
  }

  return { valid: Object.keys(errors).length === 0, data, errors };
}
