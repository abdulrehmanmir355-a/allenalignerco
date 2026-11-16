# Allen Doctor Portal — agreed target (21 October 2026)

Build a simple, professional, Allen-branded doctor portal directly connected to the complete Allen case lifecycle. Required areas: registration, professional verification, clinic, doctors/users, documents, commercial, profile, approval and activation. Responsive desktop/mobile behavior, working hover and keyboard focus, loading/error feedback, lightweight animation and reduced-motion support are acceptance criteria.

Implemented before this continuation: doctor registration, verified-account login, case lifecycle and lab APIs, plan review, documents, patient records and private clinical uploads.

This continuation: automatic immutable Patient IDs on registration, patient management directly in the doctor portal, editable own contact profile, live clinic/doctor directory, navigation and responsive interaction styles. Existing patient codes are preserved. New registration rejects caller-supplied patientCode/id. New displayed IDs are derived from the UUID primary key. Patient ID uniqueness is backed by the patient primary key for newly generated IDs and the existing clinic/code constraint. Existing historical codes are not retroactively made globally unique.

Not complete yet: administrator verification/approval/activation UI and audit, clinic invitations and role management, commercial workflows. Current professional verification remains a local authorized operator action. Do not mark the full portal complete based on the directory or status badges. Confirm intended commercial scope (quotations/invoices/payment status versus online payment) and approval/user roles before implementing those business decisions. No payment provider or approver identity is assumed.

Existing local-only large-file storage and unavailable 3D planning remain documented deployment/integration limitations, not completed production integrations.
