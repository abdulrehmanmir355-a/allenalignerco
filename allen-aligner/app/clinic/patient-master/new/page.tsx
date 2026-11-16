import { redirect } from "next/navigation";

// The legacy standalone form wrote patients without duplicate detection or an
// audit trail. Every registration now goes through the Patient Master workflow.
export default function AddPatientPage() {
  redirect("/clinic/patients");
}
