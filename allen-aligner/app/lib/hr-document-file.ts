export type ValidatedHRDocument = { extension: string; mimeType: string };

const officeZipTypes: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function validateHRDocument(name: string, bytes: Buffer): ValidatedHRDocument | null {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return null;
  const extension = name.toLowerCase().match(/\.(pdf|jpe?g|png|doc|docx|xlsx)$/)?.[0];
  if (!extension) return null;

  if (extension === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-") return { extension, mimeType: "application/pdf" };
  if ((extension === ".jpg" || extension === ".jpeg") && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return { extension: ".jpg", mimeType: "image/jpeg" };
  if (extension === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension, mimeType: "image/png" };

  const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (extension === ".doc" && bytes.subarray(0, 8).equals(oleHeader)) return { extension, mimeType: "application/msword" };

  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if ((extension === ".docx" || extension === ".xlsx") && bytes.subarray(0, 4).equals(zipHeader)) {
    return { extension, mimeType: officeZipTypes[extension] };
  }
  return null;
}
