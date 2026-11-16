import { recordCaseActivity } from './case-activity';
import { z } from 'zod';
import { db } from './database';
import { ownCases } from './portal-auth';
import { apiDoctor, failure, jsonBody, PortalError } from './portal-http';
import { safeFilename } from './file-validation';
import { authorizeCaseLab } from './lab-auth';
import { clinicalMime } from './large-file-validation';
import { CHUNK_SIZE, MAX_FILE_SIZE, createUploadId, saveUploadChunk, sha256 } from './clinical-upload-storage';
import { ensureLargeStorage, assembleUpload, downloadObject, removeUpload, removeUploadParts } from './large-upload-storage';
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const init = z.object({ name: z.string().min(1).max(240), size: z.number().int().positive().max(MAX_FILE_SIZE), sha256: checksum.optional() });
const fileSelect = { id: true, originalName: true, mime: true, sizeBytes: true, sha256: true, version: true, uploadedByRole: true, uploadedByLabel: true, createdAt: true } as const;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function largeUploadAPI(request: Request, caseId: string, parts: string[] = [], mode: 'doctor' | 'lab' = 'doctor') {
    try {
        const doctor = mode === 'doctor' ? await apiDoctor(request) : null;
        const lab = mode === 'lab' ? await authorizeCaseLab(request, caseId) : null;
        ensureLargeStorage();
        const owner = await db.portalCase.findFirst({ where: { id: caseId, ...(doctor ? ownCases(doctor) : {}) }, select: { id: true, doctorId: true, clinicId: true } });
        if (!owner)
            throw new PortalError(404, 'Case not found.');
        const ownerId = owner.doctorId;
        const actor = doctor ? { role: 'DOCTOR', label: doctor.fullName } : { role: 'LAB', label: lab!.label };
        const scope = { id: caseId, doctorId: ownerId, clinicId: owner.clinicId };
        const uploadStatuses = mode === 'doctor' ? ['DRAFT', 'CHANGES_REQUESTED'] : ['SUBMITTED', 'PLANNING', 'REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'IN_PRODUCTION'];
        const [uploadId, operation, index] = parts;
        if (request.method === 'GET' && parts.length === 0) {
            const files = await db.largeClinicalFile.findMany({ where: { caseId }, select: fileSelect, orderBy: { createdAt: 'desc' } });
            const sessions = await db.largeUploadSession.findMany({ where: { caseId, doctorId: ownerId, clinicId: owner.clinicId, uploadedByRole: actor.role, status: { in: ['CREATED', 'UPLOADING'] }, expiresAt: { gt: new Date() } }, select: { id: true, originalName: true, totalBytes: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
            return reply({ files, sessions });
        }
        if (request.method === 'GET' && uploadId === 'files' && parts.length === 2) {
            const f = await db.largeClinicalFile.findFirst({ where: { id: operation, caseId } });
            if (!f)
                throw new PortalError(404, 'File not found.');
            return new Response(await downloadObject(f.storageKey, f.sizeBytes), { headers: { 'Content-Type': f.mime, 'Content-Length': String(f.sizeBytes), 'Content-Disposition': 'attachment; filename="' + safeFilename(f.originalName) + '"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
        }
        if (request.method === 'POST' && parts.length === 0) {
            const parsed = init.safeParse(await jsonBody(request));
            if (!parsed.success)
                throw new PortalError(400, 'Choose a supported file between 1 byte and 1 GB, with a valid SHA256 if supplied.');
            const b = parsed.data;
            const name = safeFilename(b.name);
            const mime = clinicalMime(name);
            if (!mime)
                throw new PortalError(400, 'Allowed files: STL, PLY, OBJ, DCM, PDF, JPG, PNG.');
            const s = await db.transaction(async (tx) => {
                const lock = await tx.portalCase.updateMany({ where: { ...scope, status: { in: uploadStatuses } }, data: { revision: { increment: 1 } } });
                if (!lock.count)
                    throw new PortalError(409, 'This case no longer accepts records.');
                const count = await tx.largeUploadSession.count({ where: { caseId, status: { in: ['CREATED', 'UPLOADING'] }, expiresAt: { gt: new Date() } } });
                const stored = await tx.largeClinicalFile.count({ where: { caseId } });
                if (count >= 10 || stored >= 100)
                    throw new PortalError(409, 'Upload limit reached (10 active uploads, 100 stored versions).');
                return tx.largeUploadSession.create({ data: { id: createUploadId(), caseId, doctorId: ownerId, clinicId: owner.clinicId, uploadedByRole: actor.role, uploadedByLabel: actor.label, originalName: name, mime, totalBytes: b.size, chunkSize: CHUNK_SIZE, totalChunks: Math.ceil(b.size / CHUNK_SIZE), expectedSha256: b.sha256, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
            });
            return reply({ id: s.id, chunkSize: s.chunkSize, totalChunks: s.totalChunks, expiresAt: s.expiresAt }, 201);
        }
        if (!uploadId || !z.string().uuid().safeParse(uploadId).success)
            throw new PortalError(404, 'Upload not found.');
        // Buffer only one bounded chunk, before taking the database lock.
        let bytes: Buffer | undefined;
        if (request.method === 'PUT' && operation === 'chunks' && parts.length === 3) {
            const reader = request.body?.getReader();
            if (!reader)
                throw new PortalError(400, 'Chunk body required.');
            let length = 0;
            const buffers: Uint8Array[] = [];
            while (true) {
                const p = await reader.read();
                if (p.done)
                    break;
                length += p.value.length;
                if (length > CHUNK_SIZE) {
                    await reader.cancel();
                    throw new PortalError(413, 'Chunk exceeds 8 MB.');
                }
                buffers.push(p.value);
            }
            bytes = Buffer.concat(buffers);
            const digest = request.headers.get('x-chunk-sha256');
            if (!digest || !checksum.safeParse(digest).success || sha256(bytes) !== digest)
                throw new PortalError(400, 'Chunk checksum mismatch.');
        }
        const result = await db.transaction(async (tx) => {
            // Lock case row first for all mutations; protects versions, submit/finalize and cancel/chunk races.
            if (request.method !== 'GET') {
                const lock = await tx.portalCase.updateMany({ where: scope, data: { revision: { increment: 1 } } });
                if (!lock.count)
                    throw new PortalError(404, 'Case not found.');
            }
            const s = await tx.largeUploadSession.findFirst({ where: { id: uploadId, caseId, doctorId: ownerId, clinicId: owner.clinicId, uploadedByRole: actor.role }, include: { chunks: { orderBy: { chunkIndex: 'asc' } } } });
            if (!s)
                throw new PortalError(404, 'Upload not found.');
            if (request.method === 'GET' && parts.length === 1)
                return { id: s.id, status: s.status, originalName: s.originalName, totalBytes: s.totalBytes, chunkSize: s.chunkSize, totalChunks: s.totalChunks, expiresAt: s.expiresAt, chunks: s.chunks.map(c => ({ index: c.chunkIndex, size: c.sizeBytes, sha256: c.sha256 })) };
            if (request.method === 'DELETE' && parts.length === 1) {
                if (s.status === 'COMPLETED')
                    throw new PortalError(409, 'Completed files cannot be cancelled.');
                await removeUpload(s.id);
                await tx.largeUploadChunk.deleteMany({ where: { uploadId: s.id } });
                await tx.largeUploadSession.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });
                return { message: 'Upload cancelled.' };
            }
            if (request.method === 'POST' && operation === 'finalize' && parts.length === 2 && s.status === 'COMPLETED')
                return { file: await tx.largeClinicalFile.findUnique({ where: { storageKey: s.id }, select: fileSelect }) };
            if (!['CREATED', 'UPLOADING'].includes(s.status))
                throw new PortalError(409, 'Upload is no longer active.');
            if (s.expiresAt <= new Date())
                throw new PortalError(410, 'Upload expired. Cancel it and start again.');
            const c = await tx.portalCase.findUniqueOrThrow({ where: { id: caseId } });
            if (!uploadStatuses.includes(c.status))
                throw new PortalError(409, 'This case no longer accepts records.');
            if (bytes && operation === 'chunks' && parts.length === 3) {
                if (!/^(0|[1-9][0-9]*)$/.test(index || ''))
                    throw new PortalError(400, 'Invalid chunk index.');
                const i = Number(index);
                if (i >= s.totalChunks || bytes.length !== Math.min(s.chunkSize, s.totalBytes - i * s.chunkSize))
                    throw new PortalError(400, 'Incorrect chunk size or index.');
                const existing = s.chunks.find(c => c.chunkIndex === i);
                if (existing) {
                    if (existing.sha256 !== sha256(bytes))
                        throw new PortalError(409, 'A different chunk already exists. Cancel and restart.');
                    return { message: 'Chunk already received.' };
                }
                const saved = await saveUploadChunk(s.id, i, bytes);
                await tx.largeUploadChunk.create({ data: { uploadId: s.id, chunkIndex: i, sizeBytes: saved.size, sha256: saved.checksum } });
                await tx.largeUploadSession.update({ where: { id: s.id }, data: { status: 'UPLOADING' } });
                return { message: 'Chunk received.' };
            }
            if (request.method === 'POST' && operation === 'finalize' && parts.length === 2) {
                if (s.chunks.length !== s.totalChunks || s.chunks.some((c, i) => c.chunkIndex !== i))
                    throw new PortalError(409, 'Upload all missing chunks first.');
                if (await tx.largeClinicalFile.count({ where: { caseId } }) >= 100)
                    throw new PortalError(409, 'Maximum 100 stored versions per case.');
                const hash = await assembleUpload(s, s.chunks);
                const latest = await tx.largeClinicalFile.maxVersion({ caseId, originalName: s.originalName });
                const file = await tx.largeClinicalFile.create({ data: { caseId, uploadedByDoctorId: s.uploadedByRole === 'DOCTOR' ? ownerId : null, uploadedByRole: s.uploadedByRole, uploadedByLabel: s.uploadedByLabel, originalName: s.originalName, mime: s.mime, sizeBytes: s.totalBytes, storageKey: s.id, sha256: hash, version: latest + 1 }, select: fileSelect });
                await tx.largeUploadSession.update({ where: { id: s.id }, data: { status: 'COMPLETED', completedSha256: hash } });
                await recordCaseActivity(tx,caseId,c.clinicId,s.uploadedByRole === 'LAB' ? 'Laboratory returned a specialist planning file (version ' + file.version + ')' : 'Doctor attached a private clinical record (version ' + file.version + ')',{actor:{id:s.uploadedByRole === 'LAB' ? `lab:${caseId}` : ownerId,name:s.uploadedByLabel,role:s.uploadedByRole},action:'large_file_attached',fromStatus:c.status,status:c.status,notes:null});
                if (s.uploadedByRole === 'LAB') await tx.notification.create({ data: { caseId, doctorId: ownerId, text: `A specialist planning deliverable was added by ${s.uploadedByLabel}.` } });
                return { file };
            }
            throw new PortalError(405, 'Unsupported upload operation.');
        }, { maxWait: 15000, timeout: 120000 });
        // Never delete chunk data before the metadata commit succeeds.
        if (request.method === 'POST' && operation === 'finalize') {
            const s = await db.largeUploadSession.findUnique({ where: { id: uploadId } });
            if (s?.status === 'COMPLETED')
                await removeUploadParts(s.id, s.totalChunks).catch(() => { });
        }
        return reply(result);
    }
    catch (error) {
        return failure(error);
    }
}
