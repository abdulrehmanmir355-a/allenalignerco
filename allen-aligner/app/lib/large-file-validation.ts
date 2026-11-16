// Signature checks are format screening, not malware scanning or clinical validation.
export const clinicalTypes: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', stl: 'model/stl', ply: 'application/octet-stream', obj: 'text/plain', '3mf': 'model/3mf', wrl: 'model/vrml', vrml: 'model/vrml', glb: 'model/gltf-binary', gltf: 'model/gltf+json', dae: 'model/vnd.collada+xml', fbx: 'application/octet-stream', off: 'text/plain', dcm: 'application/dicom', zip: 'application/zip' };
export function clinicalMime(name: string) { return clinicalTypes[name.toLowerCase().split('.').pop() || '']; }
export function validClinicalContent(name: string, head: Buffer, tail: Buffer, size: number, full?: Buffer) {
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
    if (ext === 'zip' || ext === '3mf') {
        const bytes = full;
        if (!bytes || size < 22 || ![0x04034b50, 0x06054b50, 0x08074b50].includes(bytes.readUInt32LE(0))) return false;
        const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        if (eocd < 0 || eocd + 22 > size) return false;
        if (ext === 'zip') return true; // Stored privately; archives are never extracted by the server.
        const sample = bytes.toString('utf8');
        return sample.includes('[Content_Types].xml') && /3D\/3dmodel\.model/i.test(sample) && sample.includes('3D/3dmodel.model');
    }
    if (ext === 'ply') {
        const headerSample = (full || head).toString('latin1');
        const headerMarker = /end_header\r?\n/.exec(headerSample);
        const headerEnd = headerMarker?.index ?? -1;
        const bodyStart = headerEnd < 0 ? -1 : headerEnd + headerMarker![0].length;
        if (!/^ply\r?\nformat (ascii|binary_little_endian|binary_big_endian) 1\.0\r?\n/.test(headerSample) || headerEnd < 0 || bodyStart > head.length) return false;
        const header = headerSample.slice(0, bodyStart);
        const vertexCount = Number(header.match(/^element vertex ([1-9][0-9]*)\r?$/m)?.[1]);
        if (!Number.isSafeInteger(vertexCount) || !/^property (float|double) (x|y|z)$/m.test(header) || !/^property (float|double) x\r?\nproperty (float|double) y\r?\nproperty (float|double) z\r?$/m.test(header)) return false;
        if (/^format ascii /m.test(header)) {
            const body = (full || head).subarray(bodyStart).toString('ascii').trim().split(/\r?\n/);
            const elementLine = /^element vertex [1-9][0-9]*\r?$/m.exec(header);
            const propertyBlock = header.slice(elementLine!.index + elementLine![0].length).split(/\r?\nelement /)[0];
            const properties = propertyBlock.match(/^property .+$/gm) || [];
            const types: Record<string, (value: string) => boolean> = {
                char: value => /^-?(?:0|[1-9][0-9]*)$/.test(value) && Number(value) >= -128 && Number(value) <= 127,
                uchar: value => /^(?:0|[1-9][0-9]*)$/.test(value) && Number(value) <= 255,
                short: value => /^-?(?:0|[1-9][0-9]*)$/.test(value) && Number(value) >= -32768 && Number(value) <= 32767,
                ushort: value => /^(?:0|[1-9][0-9]*)$/.test(value) && Number(value) <= 65535,
                int: value => /^-?(?:0|[1-9][0-9]*)$/.test(value) && Number(value) >= -2147483648 && Number(value) <= 2147483647,
                uint: value => /^(?:0|[1-9][0-9]*)$/.test(value) && Number(value) <= 4294967295,
                float: value => /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)),
                double: value => /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)),
            };
            if (body.length < vertexCount || properties.length < 3) return false;
            const vertexRows = body.slice(0, vertexCount);
            if (vertexRows.length < vertexCount) return false;
            return vertexRows.every(row => {
                const values = row.trim().split(/\s+/);
                return values.length === properties.length && properties.every((property, i) => {
                    const [, type] = property.match(/^property (\S+) /) || [];
                    return !!types[type]?.(values[i]);
                });
            });
        }
        const vertexElement = header.indexOf(`element vertex ${vertexCount}`);
        const elementHeader = header.slice(vertexElement).split(/\r?\nelement /)[0];
        const properties = elementHeader.match(/^property .+$/gm) || [];
        const stride = properties.reduce((sum, property) => sum + ({ char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8 }[property.split(/\s+/)[1]] || 0), 0);
        const precedingElements = header.slice(0, vertexElement).match(/^element [^\r\n]+$/gm) || [];
        if (precedingElements.some(element => !/^element (face|edge) 0$/.test(element))) return false;
        return stride > 0 && size >= bodyStart + vertexCount * stride;
    }
    if (ext === 'obj') {
        const sample = (full || head).toString('ascii');
        if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(sample) || sample.length < size) return false;
        const lines = sample.split(/\r?\n/);
        const vertices = lines.filter(line => /^v\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(line));
        let count = 0;
        for (const line of lines) {
            if (/^(?:vt|vn)(?:\s|$)/.test(line) && !/^(?:vt|vn)\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?){0,2}\s*$/.test(line)) return false;
            if (/^v(?:\s|$)/.test(line) && !/^v\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s+-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(line)) return false;
            if (/^f\s/.test(line)) {
                const refs = line.trim().split(/\s+/).slice(1);
                if (refs.length < 3 || refs.some(ref => !/^\d+(?:\/\d*){0,2}$/.test(ref) || Number(ref.split('/')[0]) < 1 || Number(ref.split('/')[0]) > vertices.length)) return false;
                count++;
            }
        }
        return vertices.length >= 3 && count > 0;
    }
    if (ext === 'wrl' || ext === 'vrml') {
        const sample = (full || head).toString('utf8');
        return /^#VRML V(?:1\.0|2\.0) utf8\s/i.test(sample) && /\b(?:Shape|IndexedFaceSet|Coordinate)\b/.test(sample);
    }
    if (ext === 'gltf') {
        if (!full) return false;
        try {
            const data = JSON.parse(full.toString('utf8'));
            return data.asset?.version === '2.0' && Array.isArray(data.meshes) && data.meshes.length > 0 && Array.isArray(data.nodes) && (!data.buffers || data.buffers.every((b: { uri?: string }) => typeof b.uri === 'string' && b.uri.startsWith('data:')));
        } catch { return false; }
    }
    if (ext === 'dae') {
        const sample = (full || head).toString('utf8');
        return /<COLLADA\b/.test(sample) && /<geometry\b/.test(sample) && /<triangles\b|<polylist\b|<polygons\b/.test(sample);
    }
    if (ext === 'fbx') {
        return head.subarray(0, 23).toString('ascii') === 'Kaydara FBX Binary  \0\x1a\0' || (full || head).toString('ascii').startsWith('; FBX') && /Geometry::/.test((full || head).toString('ascii'));
    }
    if (ext === 'off') {
        if (!full) return false;
        const lines = full.toString('ascii').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
        if (!/^(?:OFF|COFF)$/.test(lines[0]?.trim() || '')) return false;
        const counts = lines[1]?.trim().split(/\s+/).map(Number) || [];
        const [vertices, faces] = counts;
        if (!Number.isSafeInteger(vertices) || vertices < 3 || !Number.isSafeInteger(faces) || faces < 1 || lines.length < vertices + faces + 2) return false;
        const points = lines.slice(2, vertices + 2).every(line => line.trim().split(/\s+/).slice(0, 3).length === 3 && line.trim().split(/\s+/).slice(0, 3).every(value => Number.isFinite(Number(value))));
        return points && lines.slice(vertices + 2, vertices + faces + 2).every(line => { const values = line.trim().split(/\s+/).map(Number); return values.length >= 4 && Number.isInteger(values[0]) && values[0] >= 3 && values.length === values[0] + 1 && values.slice(1).every(index => Number.isInteger(index) && index >= 0 && index < vertices); });
    }
    if (ext === 'glb') {
        if (size < 20 || head.length < 20 || head.toString('ascii', 0, 4) !== 'glTF' || head.readUInt32LE(4) !== 2 || head.readUInt32LE(8) !== size) return false;
        const jsonLength = head.readUInt32LE(12);
        if (head.readUInt32LE(16) !== 0x4e4f534a || jsonLength < 2 || jsonLength % 4 !== 0 || 20 + jsonLength > size || 20 + jsonLength > head.length) return false;
        try { const json = JSON.parse(head.toString('utf8', 20, 20 + jsonLength).trim()); return json.asset?.version === '2.0' && Array.isArray(json.meshes) && json.meshes.length > 0; } catch { return false; }
    }
    if (ext === '3mf') return false;
    if (ext === 'stl')
        return (size >= 84 && head.length >= 84 && head.readUInt32LE(80) > 0 && 84 + head.readUInt32LE(80) * 50 === size) || ((full || head).length === size && /^solid[^\r\n]*[\r\n]/.test((full || head).toString('ascii')) && (full || head).toString('ascii').includes('facet normal') && (full || head).toString('ascii').includes('vertex') && /endsolid[^\r\n]*\s*$/.test((full || head).toString('ascii')));
    return false;
}
