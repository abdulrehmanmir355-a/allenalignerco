// Database row types for the existing PostgreSQL schema.
export const CaseStatus = {"DRAFT": "DRAFT", "SUBMITTED": "SUBMITTED", "PLANNING": "PLANNING", "REVIEW": "REVIEW", "CHANGES_REQUESTED": "CHANGES_REQUESTED", "APPROVED": "APPROVED", "IN_PRODUCTION": "IN_PRODUCTION", "SHIPPED": "SHIPPED", "COMPLETED": "COMPLETED"} as const;
export type CaseStatus = typeof CaseStatus[keyof typeof CaseStatus];
export const LargeUploadStatus = {"CREATED": "CREATED", "UPLOADING": "UPLOADING", "COMPLETED": "COMPLETED", "CANCELLED": "CANCELLED", "FAILED": "FAILED"} as const;
export type LargeUploadStatus = typeof LargeUploadStatus[keyof typeof LargeUploadStatus];
export interface Doctor {
  id: string;
  clinicId: string | null;
  clinic: Clinic | null;
  sessions: DoctorSession[];
  cases: PortalCase[];
  notifications: Notification[];
  patientHistory: PatientHistory[];
  fullName: string;
  email: string;
  passwordHash: string;
  clinicName: string | null;
  phone: string | null;
  registrationNumber: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: Record<string, number>;
}
export interface Clinic {
  id: string;
  name: string;
  patients: Patient[];
  doctors: Doctor[];
  cases: PortalCase[];
  _count: Record<string, number>;
}
export interface DoctorSession {
  tokenHash: string;
  doctorId: string;
  doctor: Doctor;
  expiresAt: Date;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface LoginThrottle {
  key: string;
  attempts: number;
  expiresAt: Date;
  _count: Record<string, number>;
}
export interface PortalCase {
  id: string;
  doctorId: string;
  doctor: Doctor;
  clinicId: string;
  clinic: Clinic;
  patientId: string | null;
  patient: Patient | null;
  patientReference: string;
  category: string;
  notes: string;
  consentAt: Date;
  status: CaseStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  events: CaseEvent[];
  files: CaseFile[];
  uploadSessions: LargeUploadSession[];
  largeFiles: LargeClinicalFile[];
  plans: TreatmentPlan[];
  messages: CaseMessage[];
  notifications: Notification[];
  labAccess: LabAccess | null;
  _count: Record<string, number>;
}
export interface CaseEvent {
  id: string;
  caseId: string;
  case: PortalCase;
  label: string;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface CaseFile {
  id: string;
  caseId: string;
  case: PortalCase;
  name: string;
  mime: string;
  size: number;
  data: Buffer;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface TreatmentPlan {
  preparedByAccountId: string | null;
  preparedByEmployeeId: string | null;
  preparedAt: Date | null;
  id: string;
  caseId: string;
  case: PortalCase;
  version: number;
  summary: string;
  decision: string;
  createdAt: Date;
  reviewedAt: Date | null;
  changeSummary: string;
  createdByRole: string | null;
  createdById: string | null;
  authorName: string | null;
  parentPlanId: string | null;
  approvedByDoctorId: string | null;
  approvedAt: Date | null;
  _count: Record<string, number>;
}
export interface CaseMessage {
  id: string;
  caseId: string;
  case: PortalCase;
  author: string;
  kind: string;
  text: string;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface Notification {
  id: string;
  doctorId: string;
  doctor: Doctor;
  caseId: string;
  case: PortalCase;
  text: string;
  readAt: Date | null;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface LabAccess {
  caseId: string;
  case: PortalCase;
  tokenHash: string;
  label: string;
  expiresAt: Date;
  _count: Record<string, number>;
}
export interface Patient {
  id: string;
  clinicId: string;
  clinic: Clinic;
  patientCode: string;
  fullName: string;
  normalizedName: string;
  dateOfBirth: Date | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  normalizedEmail: string | null;
  clinicalNotes: string | null;
  medicalHistory: string | null;
  dentalHistory: string | null;
  archivedAt: Date | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  cases: PortalCase[];
  history: PatientHistory[];
  _count: Record<string, number>;
}
export interface PatientHistory {
  id: string;
  clinicId: string;
  patientId: string;
  patient: Patient;
  actorDoctorId: string | null;
  actor: Doctor | null;
  actorClinicUserId: string | null;
  action: string;
  revision: number;
  before: unknown | null;
  after: unknown;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface LargeUploadSession {
  id: string;
  caseId: string;
  case: PortalCase;
  doctorId: string;
  clinicId: string;
  uploadedByRole: string;
  uploadedByLabel: string;
  originalName: string;
  mime: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  status: LargeUploadStatus;
  expectedSha256: string | null;
  completedSha256: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  chunks: LargeUploadChunk[];
  _count: Record<string, number>;
}
export interface LargeUploadChunk {
  id: string;
  uploadId: string;
  upload: LargeUploadSession;
  chunkIndex: number;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface LargeClinicalFile {
  id: string;
  caseId: string;
  case: PortalCase;
  uploadedByDoctorId: string | null;
  uploadedByRole: string;
  uploadedByLabel: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  version: number;
  createdAt: Date;
  _count: Record<string, number>;
}
export interface Models {
  Doctor: Doctor;
  Clinic: Clinic;
  DoctorSession: DoctorSession;
  LoginThrottle: LoginThrottle;
  PortalCase: PortalCase;
  CaseEvent: CaseEvent;
  CaseFile: CaseFile;
  TreatmentPlan: TreatmentPlan;
  CaseMessage: CaseMessage;
  Notification: Notification;
  LabAccess: LabAccess;
  Patient: Patient;
  PatientHistory: PatientHistory;
  LargeUploadSession: LargeUploadSession;
  LargeUploadChunk: LargeUploadChunk;
  LargeClinicalFile: LargeClinicalFile;
}
