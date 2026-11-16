import { failure, PortalError } from "../../../../lib/portal-http";

// Retired in Module 04 completion: this endpoint inserted patients directly,
// bypassing duplicate detection and the PatientHistory audit trail. All patient
// registration now uses POST /api/clinic/patients.
export async function POST() {
  return failure(new PortalError(410, "This registration endpoint has been retired. Register patients from the Patient Master screen."));
}
