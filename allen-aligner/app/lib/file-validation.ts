export const maxFileBytes = 10 * 1024 * 1024;
export function validateFile(name: string, data: Buffer): string | null {
 if (!data.length || data.length > maxFileBytes) return null;
 const ext = name.toLowerCase().split(".").pop();
 if (ext === "pdf" && data.subarray(0,5).toString() === "%PDF-") return "application/pdf";
 if ((ext === "jpg" || ext === "jpeg") && data[0]===255 && data[1]===216 && data[2]===255 && data[data.length-2]===255 && data[data.length-1]===217) return "image/jpeg";
 if (ext === "png" && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
 if (ext === "stl") {
  if (data.length >= 84 && 84 + data.readUInt32LE(80)*50 === data.length && data.readUInt32LE(80)>0) return "application/octet-stream";
  const text=data.toString("ascii").trim();
  if (/^solid[^\r\n]*[\r\n]/.test(text) && /endsolid[^\r\n]*$/.test(text) && text.includes("facet normal") && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(text)) return "application/octet-stream";
 }
 return null;
}
export function safeFilename(name:string) { return name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(-120) || "record"; }
