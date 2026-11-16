// Signature checks are format screening, not malware scanning or clinical validation.
export const clinicalTypes: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', stl: 'application/octet-stream', ply: 'application/octet-stream', obj: 'application/octet-stream', dcm: 'application/dicom' };
export function clinicalMime(name: string) { return clinicalTypes[name.toLowerCase().split('.').pop() || '']; }
export function validClinicalContent(name: string, head: Buffer, tail: Buffer, size: number) {
    const ext = name.toLowerCase().split('.').pop();
    const text = head.toString('ascii');
    if (ext === 'pdf')
        return text.startsWith('%PDF-') && tail.toString('ascii').trimEnd().endsWith('%%EOF');
    if (ext === 'png')
        return head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && tail.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
    if (ext === 'jpg' || ext === 'jpeg')
        return head[0] === 255 && head[1] === 216 && head[2] === 255 && tail[tail.length - 2] === 255 && tail[tail.length - 1] === 217;
    if (ext === 'dcm')
        return size > 132 && head.subarray(128, 132).toString() === 'DICM'; // Part 10 only; raw datasets intentionally rejected.
    if (ext === 'ply')
        return /^ply\r?\nformat (ascii|binary_little_endian|binary_big_endian) 1\.0\r?\n/.test(text) && /\nelement vertex [1-9][0-9]*\r?\n/.test(text) && /\nend_header\r?\n/.test(text);
    if (ext === 'obj') {
        const sample = Buffer.concat([head, tail]).toString('ascii');
        if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(sample)) return false;
        const vertices = sample.match(/^v\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/gm) || [];
        const faces = sample.match(/^f\s+(?:\d+(?:\/\d*){0,2}\s+){2,}\d+(?:\/\d*){0,2}\s*$/gm) || [];
        return vertices.length >= 3 && faces.length > 0;
    }
    if (ext === 'stl')
        return (size >= 84 && head.length >= 84 && head.readUInt32LE(80) > 0 && 84 + head.readUInt32LE(80) * 50 === size) || (/^solid[^\r\n]*[\r\n]/.test(text) && text.includes('facet normal') && text.includes('vertex') && /endsolid[^\r\n]*\s*$/.test(tail.toString('ascii')));
    return false;
}
