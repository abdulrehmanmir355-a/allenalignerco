import { currentClinic } from "../../../../lib/clinic-auth";

import {
  availableClinicActions,
  canClinicUserAccess
} from "../../../../lib/clinic-permissions.mjs";

export const dynamic = "force-dynamic";

function respond(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function GET() {
  try {
    const session = await currentClinic();

    if (!session) {
      return respond({
        success: false,
        error: "CLINIC_LOGIN_REQUIRED"
      }, 401);
    }

    const user =
      session.user ??
      session.clinicUser ??
      session;

    if (!user || !user.id) {
      return respond({
        success: false,
        error: "CLINIC_SESSION_FORMAT_MISMATCH"
      }, 403);
    }

    if (user.isActive !== true) {
      return respond({
        success: false,
        error: "CLINIC_ACCOUNT_NOT_ACTIVE_OR_FIELD_MISSING"
      }, 403);
    }

    if (!user.clinicId) {
      return respond({
        success: false,
        error: "CLINIC_ASSIGNMENT_REQUIRED"
      }, 403);
    }

    if (
      !canClinicUserAccess({
        user,
        clinicId: user.clinicId,
        action: "clinic:read"
      })
    ) {
      return respond({
        success: false,
        error: "CLINIC_PERMISSION_DENIED"
      }, 403);
    }

    return respond({
      success: true,
      clinicId: user.clinicId,
      role: user.role,
      permissions: availableClinicActions({
        user,
        clinicId: user.clinicId
      })
    });

  } catch (error) {
    console.error(
      "Clinic permissions check failed",
      error
    );

    return respond({
      success: false,
      error: "CLINIC_AUTH_SERVER_ERROR"
    }, 500);
  }
}
