import 'server-only';
import { z } from 'zod';
import { db, type Database } from './database';
import { PortalError } from './portal-http';
import type { LabAccess } from './db-models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DoctorSearchResult = {
  id: string;
  fullName: string;
  email: string;
  clinicName: string | null;
  registrationNumber: string | null;
  /** Verified and clinic-linked = can receive messages */
  canContact: boolean;
};

export type LabDoctorThreadView = {
  id: string;
  caseId: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  clinicName: string | null;
  subject: string;
  status: string;
  lastMessage: string | null;
  lastAt: string | null;
  unreadByLab: number;
  createdAt: string;
  /** Present only in doctor-portal responses (from LabAccess.label) */
  labLabel?: string | null;
  /** Present only in doctor-portal responses */
  unreadByDoctor?: number;
};

export type LabDoctorMessageView = {
  id: string;
  threadId: string;
  senderRole: 'LAB' | 'DOCTOR';
  senderName: string;
  text: string;
  createdAt: string;
  readByLab: boolean;
  readByDoctor: boolean;
};

export type ThreadDetail = {
  thread: LabDoctorThreadView;
  messages: LabDoctorMessageView[];
  hasMore: boolean;
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const searchInput = z.object({
  q: z.string().trim().min(1).max(100),
}).strict();

const openThreadInput = z.object({
  doctorId: z.uuid(),
  subject: z.string().trim().min(2).max(200),
  firstMessage: z.string().trim().min(1).max(5000),
  requestId: z.uuid(),
}).strict();

const sendMessageInput = z.object({
  text: z.string().trim().min(1).max(5000),
  requestId: z.uuid(),
}).strict();

// ---------------------------------------------------------------------------
// Schema readiness check
// ---------------------------------------------------------------------------

export async function labDoctorCommReady(database: Database = db) {
  const [row] = await database.query(
    `SELECT to_regclass('public."LabDoctorThread"') IS NOT NULL
       AND to_regclass('public."LabDoctorMessage"') IS NOT NULL AS ready`
  );
  return (row as {ready:boolean}|undefined)?.ready === true;
}

// ---------------------------------------------------------------------------
// Doctor search (used by lab to find a doctor before messaging)
// Searches by: full name (ILIKE), email prefix, registration number, Doctor.id
// ---------------------------------------------------------------------------

export async function searchDoctorsForLab(
  body: unknown,
  access: Pick<LabAccess, 'caseId'>,
  database: Database = db
): Promise<DoctorSearchResult[]> {
  if (!(await labDoctorCommReady(database))) {
    throw new PortalError(503, 'Lab-doctor communication is awaiting setup.');
  }

  const parsed = searchInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, 'Enter a name, email, registration number, or doctor ID to search.');

  const raw = parsed.data.q.replace(/[\\%_]/g, '\\$&');
  const like = '%' + raw + '%';

  const rows = await database.query(
    `SELECT d.id, d."fullName", d.email, cl.name AS "clinicName",
            d."registrationNumber", d."isVerified", d."clinicId"
     FROM "Doctor" d
     LEFT JOIN "Clinic" cl ON cl.id = d."clinicId"
     WHERE d."fullName" ILIKE $1
        OR d.email ILIKE $1
        OR d."registrationNumber" ILIKE $1
        OR d.id = $2
     ORDER BY d."isVerified" DESC, lower(d."fullName")
     LIMIT 20`,
    [like, parsed.data.q.trim()]
  ) as {id:string;fullName:string;email:string;clinicName:string|null;registrationNumber:string|null;isVerified:boolean;clinicId:string|null}[];

  return rows.map(r => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    clinicName: r.clinicName ?? null,
    registrationNumber: r.registrationNumber ?? null,
    canContact: r.isVerified === true && r.clinicId !== null,
  }));
}

// ---------------------------------------------------------------------------
// Open or reuse a thread between a lab (identified by LabAccess) and a doctor
// ---------------------------------------------------------------------------

export async function openLabDoctorThread(
  body: unknown,
  access: LabAccess,
  database: Database = db
): Promise<{ threadId: string; isNew: boolean }> {
  if (!(await labDoctorCommReady(database))) {
    throw new PortalError(503, 'Lab-doctor communication is awaiting setup.');
  }

  const parsed = openThreadInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message ?? 'Check the thread details.');
  const v = parsed.data;

  const [doctor] = await database.query(
    `SELECT id, "isVerified", "clinicId" FROM "Doctor" WHERE id = $1`,
    [v.doctorId]
  ) as {id:string;isVerified:boolean;clinicId:string|null}[];
  if (!doctor) throw new PortalError(404, 'Doctor not found.');
  if (!doctor.isVerified || !doctor.clinicId) {
    throw new PortalError(409, 'This doctor is not yet verified. They cannot receive messages.');
  }

  return database.transaction(async tx => {
    const [existing] = await tx.query(
      `SELECT id FROM "LabDoctorThread" WHERE "caseId" = $1 AND "doctorId" = $2`,
      [access.caseId, v.doctorId]
    ) as {id:string}[];
    if (existing) return { threadId: String(existing.id), isNew: false };

    const [thread] = await tx.query(
      `INSERT INTO "LabDoctorThread"("caseId","doctorId",subject)
       VALUES($1,$2,$3) RETURNING id`,
      [access.caseId, v.doctorId, v.subject]
    ) as {id:string}[];

    await tx.query(
      `INSERT INTO "LabDoctorMessage"("threadId","senderRole","senderId","senderName",text,"requestId")
       VALUES($1,'LAB',$2,$3,$4,$5)`,
      [String(thread.id), access.caseId, `Lab: ${access.label}`, v.firstMessage, v.requestId]
    );

    await tx.query(
      `INSERT INTO "Notification"("doctorId","caseId",text)
       SELECT d.id, $1, 'The laboratory assigned to your case ' || $1 || ' has sent you a direct message. Open Lab Communication in your case.'
       FROM "Doctor" d WHERE d.id = $2`,
      [access.caseId, v.doctorId]
    );

    return { threadId: String(thread.id), isNew: true };
  });
}

// ---------------------------------------------------------------------------
// List all lab threads for a given LabAccess (lab side)
// ---------------------------------------------------------------------------

export async function listLabThreads(
  access: LabAccess,
  database: Database = db
): Promise<LabDoctorThreadView[]> {
  if (!(await labDoctorCommReady(database))) return [];

  const rows = await database.query(
    `SELECT t.id, t."caseId", t."doctorId",
            d."fullName" AS "doctorName", d.email AS "doctorEmail",
            cl.name AS "clinicName",
            t.subject, t.status,
            (SELECT m.text FROM "LabDoctorMessage" m
             WHERE m."threadId"=t.id ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessage",
            (SELECT m."createdAt"::text FROM "LabDoctorMessage" m
             WHERE m."threadId"=t.id ORDER BY m."createdAt" DESC LIMIT 1) AS "lastAt",
            (SELECT count(*)::int FROM "LabDoctorMessage" m
             WHERE m."threadId"=t.id AND NOT m."readByLab") AS "unreadByLab",
            t."createdAt"
     FROM "LabDoctorThread" t
     JOIN "Doctor" d ON d.id = t."doctorId"
     LEFT JOIN "Clinic" cl ON cl.id = d."clinicId"
     WHERE t."caseId" = $1
     ORDER BY t."createdAt" DESC
     LIMIT 100`,
    [access.caseId]
  ) as {id:string;caseId:string;doctorId:string;doctorName:string;doctorEmail:string;clinicName:string|null;subject:string;status:string;lastMessage:string|null;lastAt:string|null;unreadByLab:number;createdAt:Date}[];

  return rows.map(r => ({
    id: String(r.id), caseId: String(r.caseId), doctorId: String(r.doctorId),
    doctorName: String(r.doctorName), doctorEmail: String(r.doctorEmail),
    clinicName: r.clinicName ? String(r.clinicName) : null,
    subject: String(r.subject), status: String(r.status),
    lastMessage: r.lastMessage ? String(r.lastMessage) : null,
    lastAt: r.lastAt ? String(r.lastAt) : null,
    unreadByLab: Number(r.unreadByLab),
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Get a single thread's messages (lab side)
// ---------------------------------------------------------------------------

export async function getLabDoctorThread(
  threadId: string,
  access: LabAccess,
  database: Database = db
): Promise<ThreadDetail> {
  if (!(await labDoctorCommReady(database))) {
    throw new PortalError(503, 'Lab-doctor communication is awaiting setup.');
  }

  const [thread] = await database.query(
    `SELECT t.id, t."caseId", t."doctorId",
            d."fullName" AS "doctorName", d.email AS "doctorEmail",
            cl.name AS "clinicName", t.subject, t.status, t."createdAt"
     FROM "LabDoctorThread" t
     JOIN "Doctor" d ON d.id = t."doctorId"
     LEFT JOIN "Clinic" cl ON cl.id = d."clinicId"
     WHERE t.id = $1 AND t."caseId" = $2`,
    [threadId, access.caseId]
  ) as {id:string;caseId:string;doctorId:string;doctorName:string;doctorEmail:string;clinicName:string|null;subject:string;status:string;createdAt:Date}[];
  if (!thread) throw new PortalError(404, 'Thread not found or does not belong to this case.');

  const messages = await database.query(
    `SELECT id, "threadId", "senderRole", "senderName", text, "createdAt",
            "readByLab", "readByDoctor"
     FROM "LabDoctorMessage"
     WHERE "threadId" = $1
     ORDER BY "createdAt" ASC, id ASC
     LIMIT 201`,
    [threadId]
  ) as {id:string;threadId:string;senderRole:string;senderName:string;text:string;createdAt:Date;readByLab:boolean;readByDoctor:boolean}[];

  await database.query(
    `UPDATE "LabDoctorMessage" SET "readByLab" = TRUE
     WHERE "threadId" = $1 AND "senderRole" = 'DOCTOR' AND NOT "readByLab"`,
    [threadId]
  );

  return {
    thread: {
      id: String(thread.id), caseId: String(thread.caseId), doctorId: String(thread.doctorId),
      doctorName: String(thread.doctorName), doctorEmail: String(thread.doctorEmail),
      clinicName: thread.clinicName ? String(thread.clinicName) : null,
      subject: String(thread.subject), status: String(thread.status),
      lastMessage: null, lastAt: null, unreadByLab: 0,
      createdAt: new Date(thread.createdAt).toISOString(),
    },
    messages: messages.slice(0, 200).map(m => ({
      id: String(m.id), threadId: String(m.threadId),
      senderRole: m.senderRole as 'LAB' | 'DOCTOR',
      senderName: String(m.senderName), text: String(m.text),
      createdAt: new Date(m.createdAt).toISOString(),
      readByLab: m.readByLab === true, readByDoctor: m.readByDoctor === true,
    })),
    hasMore: messages.length > 200,
  };
}

// ---------------------------------------------------------------------------
// Lab sends a message into an existing thread
// ---------------------------------------------------------------------------

export async function sendLabMessage(
  threadId: string,
  body: unknown,
  access: LabAccess,
  database: Database = db
): Promise<{ id: string; duplicate: boolean }> {
  if (!(await labDoctorCommReady(database))) {
    throw new PortalError(503, 'Lab-doctor communication is awaiting setup.');
  }

  const parsed = sendMessageInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message ?? 'Enter a message.');
  const v = parsed.data;

  return database.transaction(async tx => {
    const [thread] = await tx.query(
      `SELECT id, "doctorId", "caseId" FROM "LabDoctorThread" WHERE id = $1 AND "caseId" = $2 AND status='OPEN' FOR UPDATE`,
      [threadId, access.caseId]
    ) as {id:string;doctorId:string;caseId:string}[];
    if (!thread) throw new PortalError(404, 'Thread not found, not open, or does not belong to this case.');

    const [prior] = await tx.query(
      `SELECT id, text FROM "LabDoctorMessage"
       WHERE "threadId"=$1 AND "senderRole"='LAB' AND "senderId"=$2 AND "requestId"=$3`,
      [threadId, access.caseId, v.requestId]
    ) as {id:string;text:string}[];
    if (prior) {
      if (prior.text !== v.text) throw new PortalError(409, 'This request ID was already used for a different message.');
      return { id: String(prior.id), duplicate: true };
    }

    const [rate] = await tx.query(
      `SELECT count(*)::int AS n FROM "LabDoctorMessage"
       WHERE "threadId"=$1 AND "senderRole"='LAB' AND "createdAt">now()-interval '1 minute'`,
      [threadId]
    ) as {n:number}[];
    if (rate.n >= 10) throw new PortalError(429, 'Please wait before sending more messages.');

    const [msg] = await tx.query(
      `INSERT INTO "LabDoctorMessage"("threadId","senderRole","senderId","senderName",text,"requestId")
       VALUES($1,'LAB',$2,$3,$4,$5) RETURNING id`,
      [threadId, access.caseId, `Lab: ${access.label}`, v.text, v.requestId]
    ) as {id:string}[];

    await tx.query(
      `INSERT INTO "Notification"("doctorId","caseId",text)
       VALUES($1,$2,'New message from the laboratory. Open Lab Communication for case ' || $2 || '.')`,
      [thread.doctorId, thread.caseId]
    );

    return { id: String(msg.id), duplicate: false };
  });
}

// ---------------------------------------------------------------------------
// Doctor reads and replies to a lab thread (doctor portal side)
// ---------------------------------------------------------------------------

export async function getDoctorLabThread(
  threadId: string,
  doctorId: string,
  database: Database = db
): Promise<ThreadDetail> {
  if (!(await labDoctorCommReady(database))) {
    throw new PortalError(503, 'Lab-doctor communication is awaiting setup.');
  }

  const [thread] = await database.query(
    `SELECT t.id, t."caseId", t."doctorId",
            d."fullName" AS "doctorName", d.email AS "doctorEmail",
            cl.name AS "clinicName", t.subject, t.status, t."createdAt"
     FROM "LabDoctorThread" t
     JOIN "Doctor" d ON d.id = t."doctorId"
     LEFT JOIN "Clinic" cl ON cl.id = d."clinicId"
     WHERE t.id = $1 AND t."doctorId" = $2`,
    [threadId, doctorId]
  ) as {id:string;caseId:string;doctorId:string;doctorName:string;doctorEmail:string;clinicName:string|null;subject:string;status:string;createdAt:Date}[];
  if (!thread) throw new PortalError(404, 'Lab message thread not found.');

  const messages = await database.query(
    `SELECT id, "threadId", "senderRole", "senderName", text, "createdAt",
            "readByLab", "readByDoctor"
     FROM "LabDoctorMessage" WHERE "threadId" = $1
     ORDER BY "createdAt" ASC, id ASC LIMIT 201`,
    [threadId]
  ) as {id:string;threadId:string;senderRole:string;senderName:string;text:string;createdAt:Date;readByLab:boolean;readByDoctor:boolean}[];

  await database.query(
    `UPDATE "LabDoctorMessage" SET "readByDoctor" = TRUE
     WHERE "threadId" = $1 AND "senderRole" = 'LAB' AND NOT "readByDoctor"`,
    [threadId]
  );

  return {
    thread: {
      id: String(thread.id), caseId: String(thread.caseId), doctorId: String(thread.doctorId),
      doctorName: String(thread.doctorName), doctorEmail: String(thread.doctorEmail),
      clinicName: thread.clinicName ? String(thread.clinicName) : null,
      subject: String(thread.subject), status: String(thread.status),
      lastMessage: null, lastAt: null, unreadByLab: 0,
      createdAt: new Date(thread.createdAt).toISOString(),
    },
    messages: messages.slice(0, 200).map(m => ({
      id: String(m.id), threadId: String(m.threadId),
      senderRole: m.senderRole as 'LAB' | 'DOCTOR',
      senderName: String(m.senderName), text: String(m.text),
      createdAt: new Date(m.createdAt).toISOString(),
      readByLab: m.readByLab === true, readByDoctor: m.readByDoctor === true,
    })),
    hasMore: messages.length > 200,
  };
}

export async function sendDoctorReply(
  threadId: string,
  body: unknown,
  doctor: { id: string; fullName: string },
  database: Database = db
): Promise<{ id: string; duplicate: boolean }> {
  if (!(await labDoctorCommReady(database))) {
    throw new PortalError(503, 'Lab-doctor communication is awaiting setup.');
  }

  const parsed = sendMessageInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, parsed.error.issues[0]?.message ?? 'Enter a message.');
  const v = parsed.data;

  return database.transaction(async tx => {
    const [thread] = await tx.query(
      `SELECT id, "caseId" FROM "LabDoctorThread"
       WHERE id = $1 AND "doctorId" = $2 AND status='OPEN' FOR UPDATE`,
      [threadId, doctor.id]
    ) as {id:string;caseId:string}[];
    if (!thread) throw new PortalError(404, 'Thread not found or already closed.');

    const [prior] = await tx.query(
      `SELECT id, text FROM "LabDoctorMessage"
       WHERE "threadId"=$1 AND "senderRole"='DOCTOR' AND "senderId"=$2 AND "requestId"=$3`,
      [threadId, doctor.id, v.requestId]
    ) as {id:string;text:string}[];
    if (prior) {
      if (prior.text !== v.text) throw new PortalError(409, 'This request ID was already used.');
      return { id: String(prior.id), duplicate: true };
    }

    const [rate] = await tx.query(
      `SELECT count(*)::int AS n FROM "LabDoctorMessage"
       WHERE "threadId"=$1 AND "senderRole"='DOCTOR' AND "createdAt">now()-interval '1 minute'`,
      [threadId]
    ) as {n:number}[];
    if (rate.n >= 10) throw new PortalError(429, 'Please wait before sending more replies.');

    const [msg] = await tx.query(
      `INSERT INTO "LabDoctorMessage"("threadId","senderRole","senderId","senderName",text,"requestId")
       VALUES($1,'DOCTOR',$2,$3,$4,$5) RETURNING id`,
      [threadId, doctor.id, doctor.fullName, v.text, v.requestId]
    ) as {id:string}[];

    await tx.query(
      `INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
       SELECT w.id::text, w."employeeId", current_date,
              'LAB_DOCTOR_MSG:' || $1,
              'Doctor replied to lab message in case ' || $2 || '. View Lab Communication under Internal Clinical Review.'
       FROM "WorkAccount" w
       JOIN "ClinicalIdentity" ci ON ci."accountId" = w.id
       WHERE w."isActive" AND NOT w."mustChangePassword"
         AND ci.status = 'ACTIVE'
         AND w."clinicalRole" IN ('LEAD','ADMIN')
       ON CONFLICT DO NOTHING`,
      [thread.id, thread.caseId]
    );

    return { id: String(msg.id), duplicate: false };
  });
}

// ---------------------------------------------------------------------------
// Clinical staff oversight: list all lab-doctor threads for a case
// ---------------------------------------------------------------------------

export async function listLabThreadsForClinical(
  caseId: string,
  database: Database = db
): Promise<LabDoctorThreadView[]> {
  if (!(await labDoctorCommReady(database))) return [];

  const rows = await database.query(
    `SELECT t.id, t."caseId", t."doctorId",
            d."fullName" AS "doctorName", d.email AS "doctorEmail",
            cl.name AS "clinicName", t.subject, t.status,
            (SELECT m.text FROM "LabDoctorMessage" m WHERE m."threadId"=t.id
             ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessage",
            (SELECT m."createdAt"::text FROM "LabDoctorMessage" m WHERE m."threadId"=t.id
             ORDER BY m."createdAt" DESC LIMIT 1) AS "lastAt",
            (SELECT count(*)::int FROM "LabDoctorMessage" m
             WHERE m."threadId"=t.id AND NOT m."readByLab") AS "unreadByLab",
            t."createdAt"
     FROM "LabDoctorThread" t
     JOIN "Doctor" d ON d.id = t."doctorId"
     LEFT JOIN "Clinic" cl ON cl.id = d."clinicId"
     WHERE t."caseId" = $1
     ORDER BY t."createdAt" DESC LIMIT 100`,
    [caseId]
  ) as {id:string;caseId:string;doctorId:string;doctorName:string;doctorEmail:string;clinicName:string|null;subject:string;status:string;lastMessage:string|null;lastAt:string|null;unreadByLab:number;createdAt:Date}[];

  return rows.map(r => ({
    id: String(r.id), caseId: String(r.caseId), doctorId: String(r.doctorId),
    doctorName: String(r.doctorName), doctorEmail: String(r.doctorEmail),
    clinicName: r.clinicName ? String(r.clinicName) : null,
    subject: String(r.subject), status: String(r.status),
    lastMessage: r.lastMessage ? String(r.lastMessage) : null,
    lastAt: r.lastAt ? String(r.lastAt) : null,
    unreadByLab: Number(r.unreadByLab),
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}
