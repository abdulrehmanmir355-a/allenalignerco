export function validateDoctorApproval({
  ownerAuthorized,
  doctor,
  clinic
}) {
  if (ownerAuthorized !== true) {
    return {
      allowed: false,
      reason: "OWNER_ACCESS_REQUIRED"
    };
  }

  if (!doctor || !doctor.id) {
    return {
      allowed: false,
      reason: "DOCTOR_NOT_FOUND"
    };
  }

  if (doctor.isVerified === true) {
    return {
      allowed: false,
      reason: "DOCTOR_ALREADY_VERIFIED"
    };
  }

  if (!clinic || !clinic.id) {
    return {
      allowed: false,
      reason: "VALID_CLINIC_REQUIRED"
    };
  }

  if (
    doctor.clinicId &&
    doctor.clinicId !== clinic.id
  ) {
    return {
      allowed: false,
      reason: "CLINIC_MISMATCH"
    };
  }

  if (
    !doctor.registrationNumber ||
    !doctor.fullName ||
    !doctor.email
  ) {
    return {
      allowed: false,
      reason: "INCOMPLETE_DOCTOR_PROFILE"
    };
  }

  return {
    allowed: true,
    reason: "READY_FOR_APPROVAL",
    doctorId: doctor.id,
    clinicId: clinic.id
  };
}
