import { largeUploadAPI } from '@/app/lib/large-upload-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, { params }: { params: Promise<{ id: string; parts?: string[] }> }) {
  const { id, parts } = await params;
  return largeUploadAPI(request, id, parts, 'lab');
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
