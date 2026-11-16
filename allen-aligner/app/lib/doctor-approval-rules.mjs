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

  if (!clinic || !clinic.id) {
    return {
      allowed: false,
      reason: "VALID_CLINIC_REQUIRED"
    };
  }

  if (doctor.isVerified === true) {
    return {
      allowed: false,
      reason: "DOCTOR_ALREADY_VERIFIED"
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
    !doctor.fullName ||
    !doctor.email ||
    !doctor.registrationNumber ||
    !String(doctor.registrationNumber).trim()
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

export function validateManufacturingHandoff({
  setup,
  order,
  planVersion,
  doctorId,
  artifactSha256
}) {
  if (setup?.ready !== true || setup.trigger !== true) {
    return {
      allowed: false,
      reason: "MANUFACTURING_SETUP_UNAVAILABLE"
    };
  }

  if (
    !order ||
    String(order.status) !== "MATERIAL_CHECK" ||
    Number(order.planVersion) !== Number(planVersion) ||
    String(order.approvedDoctorId) !== String(doctorId) ||
    String(order.artifactSha256) !== String(artifactSha256)
  ) {
    return {
      allowed: false,
      reason: "MANUFACTURING_ORDER_MISMATCH"
    };
  }

  return {
    allowed: true,
    orderNumber: String(order.orderNumber)
  };
}
