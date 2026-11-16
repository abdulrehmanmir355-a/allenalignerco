
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_FILE_SIZE = 1024 * 1024 * 1024;

const ROOT = path.join(
  process.cwd(),
  ".private-clinical-uploads"
);

function validUploadId(uploadId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uploadId
  );
}

function getUploadFolder(uploadId: string): string {
  if (!validUploadId(uploadId)) {
    throw new Error("Invalid upload identifier.");
  }

  return path.join(ROOT, uploadId);
}

export function createUploadId(): string {
  return randomUUID();
}

export function sha256(data: Buffer): string {
  return createHash("sha256")
    .update(data)
    .digest("hex");
}

export async function saveUploadChunk(
  uploadId: string,
  chunkIndex: number,
  data: Buffer
): Promise<{
  chunkIndex: number;
  size: number;
  checksum: string;
}> {
  if (
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE)
  ) {
    throw new Error("Invalid chunk index.");
  }

  if (data.length === 0 || data.length > CHUNK_SIZE) {
    throw new Error("Invalid chunk size.");
  }

  const folder = getUploadFolder(uploadId);
  await mkdir(folder, { recursive: true, mode: 0o700 });

  const filename = `${chunkIndex}.part`;
  const destination = path.join(folder, filename);
  const temporary = path.join(folder, `${randomUUID()}.tmp`);
  const checksum = sha256(data);

  try {
    await writeFile(temporary, data, {
      flag: "wx",
      mode: 0o600,
    });

    // On local development storage, keep the chunk
    // until the authenticated upload API finalizes it.
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }

  return {
    chunkIndex,
    size: data.length,
    checksum,
  };
}

export async function readUploadChunk(
  uploadId: string,
  chunkIndex: number
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE)
  ) {
    throw new Error("Invalid chunk index.");
  }

  return readFile(
    path.join(getUploadFolder(uploadId), `${chunkIndex}.part`)
  );
}
