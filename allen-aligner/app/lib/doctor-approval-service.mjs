import {
  validateDoctorApproval
} from "./doctor-approval-rules.mjs";

export async function approveDoctor({
  ownerAuthorized,
  ownerId,
  doctorId,
  clinicId,
  repository
}) {
  if (ownerAuthorized !== true || !ownerId) {
    throw new Error("OWNER_ACCESS_REQUIRED");
  }

  if (
    typeof doctorId !== "string" ||
    !doctorId.trim() ||
    typeof clinicId !== "string" ||
    !clinicId.trim()
  ) {
    throw new Error("INVALID_APPROVAL_REQUEST");
  }

  if (
    !repository ||
    typeof repository.inTransaction !== "function"
  ) {
    throw new Error("DATABASE_ADAPTER_REQUIRED");
  }

  return repository.inTransaction(async (tx) => {
    const doctor = await tx.getDoctorForUpdate(doctorId);
    const clinic = await tx.getClinic(clinicId);

    const result = validateDoctorApproval({
      ownerAuthorized: true,
      doctor,
      clinic
    });

    if (!result.allowed) {
      throw new Error(result.reason);
    }

    const updated = await tx.setDoctorApproved({
      doctorId,
      clinicId
    });

    if (updated !== 1) {
      throw new Error("APPROVAL_CONFLICT");
    }

    await tx.writeAudit({
      actorId: ownerId,
      doctorId,
      clinicId,
      action: "DOCTOR_APPROVED",
      occurredAt: new Date().toISOString()
    });

    return {
      success: true,
      doctorId,
      clinicId,
      status: "APPROVED"
    };
  });
}
