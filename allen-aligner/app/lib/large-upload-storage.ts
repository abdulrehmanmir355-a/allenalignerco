import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { CHUNK_SIZE, readUploadChunk, sha256 } from './clinical-upload-storage';
import { validClinicalContent } from './large-file-validation';
import { PortalError } from './portal-http';
const root = path.join(process.cwd(), '.private-clinical-uploads');
function folder(id: string) { if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new PortalError(400, 'Invalid upload ID.'); return path.join(root, id); }
export function ensureLargeStorage() {
    if (process.env.ENABLE_PRIVATE_UPLOADS !== 'true')
        throw new PortalError(503, 'Private uploads are disabled.');
    if (process.env.NODE_ENV === 'production')
        throw new PortalError(503, 'Large uploads require a production private object storage adapter. Local development storage is disabled in production.');
}
export async function removeUploadParts(id: string, total: number) { await Promise.all(Array.from({ length: total }, (_, i) => rm(path.join(folder(id), i + '.part'), { force: true }))); }
export async function removeUpload(id: string) { await rm(folder(id), { recursive: true, force: true }); }
export async function assembleUpload(s: {
    id: string;
    originalName: string;
    totalBytes: number;
    expectedSha256: string | null;
}, chunks: {
    chunkIndex: number;
    sizeBytes: number;
    sha256: string;
}[]) {
    const dir = folder(s.id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temporary = path.join(dir, randomUUID() + '.tmp');
    const out = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256');
    let size = 0;
    let head: Buffer = Buffer.alloc(0), tail: Buffer = Buffer.alloc(0);
    const extension = s.originalName.toLowerCase().split('.').pop();
    let needsFullValidation = /^(?:obj|3mf|wrl|vrml|gltf|dae|fbx|off|zip)$/.test(extension || '');
    const validationBuffers: Buffer[] = [];
    try {
        for (const c of chunks) {
            const bytes = await readUploadChunk(s.id, c.chunkIndex);
            if (bytes.length !== c.sizeBytes || sha256(bytes) !== c.sha256)
                throw new PortalError(409, 'Stored chunk is damaged. Cancel and upload again.');
            hash.update(bytes);
            size += bytes.length;
            if (!head.length)
                head = bytes.subarray(0, 65536);
            if (c.chunkIndex === 0 && extension === 'ply' && /^ply\r?\nformat ascii /i.test(bytes.toString('ascii', 0, Math.min(bytes.length, 128)))) {
                if (s.totalBytes > 128 * 1024 * 1024) throw new PortalError(413, 'ASCII PLY files are limited to 128 MB for safe content verification.');
                needsFullValidation = true;
            }
            if (c.chunkIndex === 0 && extension === 'stl' && /^solid[^\r\n]*[\r\n]/i.test(bytes.toString('ascii', 0, Math.min(bytes.length, 128)))) {
                const binaryCount = bytes.length >= 84 ? bytes.readUInt32LE(80) : 0;
                const isValidBinary = binaryCount > 0 && 84 + binaryCount * 50 === s.totalBytes;
                if (!isValidBinary) {
                    if (s.totalBytes > 128 * 1024 * 1024) throw new PortalError(413, 'ASCII STL files are limited to 128 MB for safe content verification.');
                    needsFullValidation = true;
                }
            }
            tail = Buffer.concat([tail, bytes]).subarray(-65536);
            if (needsFullValidation) validationBuffers.push(bytes);
            await out.writeFile(bytes);
        }
        const checksum = hash.digest('hex');
        if (size !== s.totalBytes)
            throw new PortalError(400, 'File size mismatch.');
        if (s.expectedSha256 && s.expectedSha256 !== checksum)
            throw new PortalError(400, 'File checksum mismatch.');
        if (!validClinicalContent(s.originalName, head, tail, size, needsFullValidation ? Buffer.concat(validationBuffers, size) : undefined))
            throw new PortalError(400, 'File content does not match the selected clinical format.');
        await out.sync();
        await out.close();
        await rename(temporary, path.join(dir, 'object'));
        return checksum;
    }
    catch (e) {
        await out.close().catch(() => { });
        await rm(temporary, { force: true });
        throw e;
    }
}
export async function downloadObject(key: string, size: number) { const file = path.join(folder(key), 'object'); const info = await stat(file); if (info.size !== size)
    throw new PortalError(503, 'Stored file is unavailable.'); return Readable.toWeb(createReadStream(file, { highWaterMark: CHUNK_SIZE })) as ReadableStream<Uint8Array>; }

export async function verifyStoredObject(key: string, size: number, expected: string) {
    ensureLargeStorage();
    if (!Number.isSafeInteger(size) || size <= 0 || !/^[a-f0-9]{64}$/.test(expected)) throw new PortalError(409, 'Required plan artifact metadata is unavailable.');
    try {
        const file = path.join(folder(key), 'object');
        if ((await stat(file)).size !== size) throw new Error('Size mismatch');
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        if (hash.digest('hex') !== expected) throw new Error('Checksum mismatch');
    } catch { throw new PortalError(409, 'A required plan artifact is missing or damaged. Ask planning to publish a complete version.'); }
}
