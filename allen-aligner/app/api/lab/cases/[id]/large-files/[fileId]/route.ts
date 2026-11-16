import { db } from '@/app/lib/database';
import { digest } from '@/app/lib/portal-auth';
import { failure, PortalError } from '@/app/lib/portal-http';
import { safeFilename } from '@/app/lib/file-validation';
import { ensureLargeStorage, downloadObject } from '@/app/lib/large-upload-storage';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: {
    params: Promise<{
        id: string;
        fileId: string;
    }>;
}) {
    try {
        const { id, fileId } = await params;
        const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
        if (!token || !/^[a-f0-9]{64}$/.test(token))
            throw new PortalError(401, 'Lab access required.');
        const access = await db.labAccess.findUnique({ where: { caseId: id } });
        if (!access || access.tokenHash !== digest(token) || access.expiresAt <= new Date())
            throw new PortalError(403, 'Lab access denied.');
        ensureLargeStorage();
        const f = await db.largeClinicalFile.findFirst({ where: { id: fileId, caseId: id, case: { status: { not: 'DRAFT' } } } });
        if (!f)
            throw new PortalError(404, 'File not found.');
        return new Response(await downloadObject(f.storageKey, f.sizeBytes), { headers: { 'Content-Type': f.mime, 'Content-Length': String(f.sizeBytes), 'Content-Disposition': 'attachment; filename="' + safeFilename(f.originalName) + '"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    catch (e) {
        return failure(e);
    }
}
