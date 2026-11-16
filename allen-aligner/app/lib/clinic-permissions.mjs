const ALL_ROLES = [
  "CLINIC_ADMIN",
  "CLINIC_STAFF",
  "CLINIC_VIEWER"
];

const EDIT_ROLES = [
  "CLINIC_ADMIN",
  "CLINIC_STAFF"
];

const ADMIN_ONLY = [
  "CLINIC_ADMIN"
];

const POLICIES = Object.freeze({
  "clinic:read": {
    roles: ALL_ROLES,
    patients: false
  },
  "clinic:settings": {
    roles: ADMIN_ONLY,
    patients: false
  },
  "team:read": {
    roles: ALL_ROLES,
    patients: false
  },
  "team:manage": {
    roles: ADMIN_ONLY,
    patients: false
  },
  "permissions:manage": {
    roles: ADMIN_ONLY,
    patients: false
  },
  "patients:read": {
    roles: ALL_ROLES,
    patients: true
  },
  "patients:write": {
    roles: EDIT_ROLES,
    patients: true
  },
  "cases:read": {
    roles: ALL_ROLES,
    patients: true
  },
  "cases:create": {
    roles: EDIT_ROLES,
    patients: true
  },
  "cases:update": {
    roles: EDIT_ROLES,
    patients: true
  },
  "documents:read": {
    roles: ALL_ROLES,
    patients: true
  },
  "documents:upload": {
    roles: EDIT_ROLES,
    patients: true
  },
  "appointments:read": {
    roles: ALL_ROLES,
    patients: true
  },
  "appointments:manage": {
    roles: EDIT_ROLES,
    patients: true
  }
});

export function canClinicUserAccess({
  user,
  clinicId,
  action
}) {
  if (!user || user.isActive !== true) {
    return false;
  }

  if (
    typeof clinicId !== "string" ||
    !clinicId.trim() ||
    typeof user.clinicId !== "string" ||
    user.clinicId !== clinicId
  ) {
    return false;
  }

  const policy = POLICIES[action];

  if (!policy) {
    return false;
  }

  if (!policy.roles.includes(user.role)) {
    return false;
  }

  if (
    policy.patients &&
    user.canAccessPatients !== true
  ) {
    return false;
  }

  return true;
}

export function requireClinicPermission(input) {
  if (!canClinicUserAccess(input)) {
    const error = new Error("CLINIC_ACCESS_DENIED");
    error.status = 403;
    throw error;
  }

  return true;
}

export function availableClinicActions({
  user,
  clinicId
}) {
  return Object.keys(POLICIES).filter(action =>
    canClinicUserAccess({
      user,
      clinicId,
      action
    })
  );
}
