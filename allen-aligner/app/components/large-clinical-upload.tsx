"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { sha256 } from "@noble/hashes/sha2.js";
import { useRouter } from 'next/navigation';
import ClinicalModelViewer from './clinical-model-viewer';
import { caseRecordExtensions } from '../lib/case-intake';
type Row = {
    key: string;
    id?: string;
    name: string;
    size: number;
    file?: File;
    progress: number;
    state: string;
    message?: string;
};
type Stored = {
    id: string;
    originalName: string;
    sizeBytes: number;
    version: number;
    createdAt: string;
    uploadedByLabel?: string;
};
type Session = {
    id: string;
    originalName: string;
    totalBytes: number;
};
type Status = {
    status: string;
    chunkSize: number;
    totalChunks: number;
    chunks: {
        index: number;
        sha256: string;
    }[];
};
// LAN HTTP is not a secure context: subtle and randomUUID may be absent.
// Checksums still use SHA-256; authentication and server validation are unchanged.
async function digest(blob: Blob) {
    const bytes = await blob.arrayBuffer();
    const hash = globalThis.crypto?.subtle
        ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
        : sha256(new Uint8Array(bytes));
    return Array.from(hash, v => v.toString(16).padStart(2, '0')).join('');
}
async function api(url: string, method = 'GET', body?: unknown, authorizationToken?: string) { const headers: Record<string, string> = {}; if (body) headers['Content-Type'] = 'application/json'; if (authorizationToken) headers.Authorization = `Bearer ${authorizationToken}`; const r = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers, body: body ? JSON.stringify(body) : undefined }); const data = await r.json(); if (!r.ok)
    throw Error(data.message || 'Request failed.'); return data; }
export default function LargeClinicalUpload({ action, canUpload, authorizationToken, onUploadComplete, patientReference, uploaderLabel, maxFileSize = 1024 ** 3, recordType = 'scan' }: {
    action: string;
    canUpload: boolean;
    authorizationToken?: string;
    onUploadComplete?: () => void;
    patientReference?: string;
    uploaderLabel?: string;
    maxFileSize?: number;
    recordType?: 'scan' | 'photo' | 'xray';
}) {
    const acceptedExtensions = caseRecordExtensions[recordType].map(extension => '.' + extension).join(',');
    const router = useRouter();
    const [rows, setRows] = useState<Row[]>([]);
    const [files, setFiles] = useState<Stored[]>([]);
    const [notice, setNotice] = useState('');
    const [model, setModel] = useState<Stored | null>(null);
    const nextKey = useRef(0);
    const active = useRef(new Set<string>());
    const paused = useRef(new Set<string>());
    const transfers = useRef(new Map<string, XMLHttpRequest>());
    const mounted = useRef(true);
    const update = (key: string, patch: Partial<Row>) => { if (mounted.current)
        setRows(old => old.map(r => r.key === key ? { ...r, ...patch } : r)); };
    const refresh = useCallback(async () => { try {
        const data = await api(`${action}?recordType=${encodeURIComponent(recordType)}`, 'GET', undefined, authorizationToken);
        if (!mounted.current)
            return;
        setFiles(data.files);
        setRows(old => { const result = [...old]; for (const s of data.sessions as Session[])
            if (!result.some(r => r.id === s.id))
                result.push({ key: s.id, id: s.id, name: s.originalName, size: s.totalBytes, progress: 0, state: 'paused', message: 'Select the original file to resume.' }); return result; });
    }
    catch (e) {
        if (mounted.current)
            setNotice((e as Error).message);
    } }, [action, authorizationToken, recordType]);
    useEffect(() => { mounted.current = true; const timer = window.setTimeout(() => void refresh(), 0); const running = active.current, stopped = paused.current, xhrs = transfers.current; return () => { window.clearTimeout(timer); mounted.current = false; for (const key of running)
        stopped.add(key); for (const xhr of xhrs.values())
        xhr.abort(); }; }, [refresh]);
    function select(list: FileList | null) { if (!list)
        return; for (const file of Array.from(list)) {
        if (!caseRecordExtensions[recordType].some(extension => file.name.toLowerCase().endsWith('.' + extension)) || file.size < 1 || file.size > maxFileSize) {
            setNotice(`This ${recordType} category accepts: ${caseRecordExtensions[recordType].map(extension => '.' + extension).join(', ')}. Maximum ${(maxFileSize / 1024 ** 3).toFixed(maxFileSize % (1024 ** 3) ? 2 : 0)} GB per file.`);
            continue;
        }
        const key = `local-${++nextKey.current}`;
        setRows(old => { const match = old.find(r => !r.file && r.state === 'paused' && r.size === file.size && r.name === file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-120)); return match ? old.map(r => r.key === match.key ? { ...r, file, message: 'Ready to resume.' } : r) : [...old, { key, name: file.name, size: file.size, file, progress: 0, state: 'ready' }]; });
    } }
    async function run(row: Row) {
        if (!row.file || active.current.has(row.key))
            return;
        active.current.add(row.key);
        paused.current.delete(row.key);
        update(row.key, { state: 'uploading', message: '' });
        let id = row.id;
        try {
            if (!id) {
                const created = await api(action, 'POST', { name: row.name, size: row.size, recordType }, authorizationToken);
                id = created.id;
                update(row.key, { id });
            }
            if (paused.current.has(row.key)) throw Error('Paused. Resume to continue.');
            const status: Status = await api(action + '/' + id, 'GET', undefined, authorizationToken);
            if (status.status === 'COMPLETED') {
                update(row.key, { state: 'complete', progress: 100, file: undefined, message: 'Stored privately.' });
                await refresh();
                onUploadComplete?.();
                router.refresh();
                return;
            }
            if (!['CREATED', 'UPLOADING'].includes(status.status))
                throw Error('This upload is no longer active. Cancel and select the file again.');
            let sent = 0;
            for (let i = 0; i < status.totalChunks; i++) {
                if (paused.current.has(row.key))
                    throw Error('Paused. Resume to continue.');
                const blob = row.file.slice(i * status.chunkSize, Math.min(row.size, (i + 1) * status.chunkSize));
                const hash = await digest(blob);
                const previous = status.chunks.find(c => c.index === i);
                if (previous && previous.sha256 !== hash)
                    throw Error('Selected file differs from uploaded chunks. Select the original file or cancel.');
                if (paused.current.has(row.key))
                    throw Error('Paused. Resume to continue.');
                if (!previous)
                    await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); transfers.current.set(row.key, xhr); xhr.open('PUT', action + '/' + id + '/chunks/' + i); if (authorizationToken) xhr.setRequestHeader('Authorization', `Bearer ${authorizationToken}`); xhr.setRequestHeader('X-Chunk-SHA256', hash); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.timeout = 120000; xhr.upload.onprogress = e => update(row.key, { progress: Math.min(99, Math.round((sent + e.loaded) / row.size * 100)) }); xhr.onload = () => { transfers.current.delete(row.key); if (xhr.status >= 200 && xhr.status < 300)
                        resolve();
                    else {
                        let message = 'Chunk failed. Resume to retry.';
                        try {
                            message = JSON.parse(xhr.responseText).message || message;
                        }
                        catch { }
                        reject(Error(message));
                    } }; xhr.onerror = xhr.ontimeout = () => { transfers.current.delete(row.key); reject(Error('Connection interrupted. Resume to retry missing chunks.')); }; xhr.onabort = () => { transfers.current.delete(row.key); reject(Error('Paused. Resume to continue.')); }; xhr.send(blob); });
                sent += blob.size;
                update(row.key, { progress: Math.min(99, Math.round(sent / row.size * 100)) });
            }
            if (paused.current.has(row.key))
                throw Error('Paused. Resume to continue.');
            update(row.key, { state: 'finalizing', message: 'Verifying and saving privately…' });
            await api(action + '/' + id + '/finalize', 'POST', {}, authorizationToken);
            update(row.key, { state: 'complete', progress: 100, message: 'Stored privately.', file: undefined });
            await refresh();
            onUploadComplete?.();
            router.refresh();
        }
        catch (e) {
            update(row.key, { state: 'paused', message: (e as Error).message });
        }
        finally {
            active.current.delete(row.key);
        }
    }
    async function cancel(row: Row) { if (active.current.has(row.key))
        return; update(row.key, { state: 'cancelling' }); try {
        if (row.id)
            await api(action + '/' + row.id, 'DELETE', undefined, authorizationToken);
        setRows(old => old.filter(r => r.key !== row.key));
    }
    catch (e) {
        update(row.key, { state: 'paused', message: (e as Error).message });
    } }

    async function download(file: Stored) {
        const headers = authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : undefined;
        const response = await fetch(action + '/files/' + file.id, { headers, cache: 'no-store' });
        if (!response.ok) { const data = await response.json().catch(() => ({})); setNotice(data.message || 'Unable to download the private file.'); return; }
        const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a');
        anchor.href = url; anchor.download = file.originalName; anchor.click(); URL.revokeObjectURL(url);
    }

    function openModel(file: Stored) {
        setModel(file);
    }

    return (
      <div className="form-stack" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={event => { event.preventDefault(); if (canUpload) select(event.dataTransfer.files); }}>
        {model && <ClinicalModelViewer key={model.id} url={action + '/files/' + encodeURIComponent(model.id) + '?preview=1'} authorizationToken={authorizationToken} name={model.originalName} onClose={() => setModel(null)} />}
        <h3>Large clinical files</h3>
        {(patientReference || uploaderLabel) && <p className="fine-print">Patient / case: {patientReference || 'Linked to this case'}{uploaderLabel ? ` · Uploading as ${uploaderLabel}` : ''}</p>}
        <p className="fine-print">
          3D scans: STL, OBJ, PLY, 3MF, WRL/VRML, GLB/GLTF, DAE, FBX and OFF. Attachments: DICOM (Part 10), ZIP, PDF, JPG and PNG. Preview is available for STL, OBJ, PLY and GLB. Maximum {(maxFileSize / 1024 ** 3).toFixed(maxFileSize % (1024 ** 3) ? 2 : 0)} GB per file.
          Uploads can resume for 24 hours; after reloading, select the original files again.
          Same-name uploads create a new version. Mesh files open as source models; no treatment movements are generated.
        </p>
        {files.length > 0 ? (
          <ul>{files.map(f => (
            <li key={f.id}>
              {authorizationToken ? <button type="button" className="text-link" onClick={() => void download(f)}>{f.originalName}</button> : <a href={action + '/files/' + f.id}>{f.originalName}</a>}
        { /\.(stl|ply|obj|glb|gltf|3mf|wrl|vrml|dae|fbx|off)$/i.test(f.originalName) && <button type="button" className="text-link" onClick={() => openModel(f)}>Open 3D model</button> }
              {' · v'}{f.version}{' · '}{(f.sizeBytes / 1024 / 1024).toFixed(2)} MB
              {f.uploadedByLabel ? ` · ${f.uploadedByLabel}` : ''}{f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString()}` : ''}
            </li>
          ))}</ul>
        ) : <p>No large files attached.</p>}
        {canUpload && <>
          <label className="notice" style={{ display: 'block', cursor: 'pointer' }}>Drop files here or choose files
            <input type="file" multiple accept={acceptedExtensions}
              onChange={e => { select(e.target.files); e.target.value = ''; }} />
          </label>
          {rows.map(r => (
            <div key={r.key} className="notice">
              <strong>{r.name}</strong>
              <p>{(r.size / 1024 / 1024).toFixed(2)} MB · {r.state}</p>
              <progress aria-label={'Upload progress for ' + r.name}
                value={r.progress} max={100} style={{ width: '100%' }} />
              <p role="status">{r.progress}% {r.message}</p>
              {r.state === 'paused' && (
                <label>Reselect original file
                  <input type="file" accept={acceptedExtensions}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file && file.size === r.size) {
                        update(r.key, { file, message: 'Ready to resume; existing chunks will be verified.' });
                      } else {
                        update(r.key, { message: 'Select the original file with the same size.' });
                      }
                    }} />
                </label>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {['ready', 'paused'].includes(r.state) && (
                  <button type="button" className="button" disabled={!r.file}
                    onClick={() => void run(r)}>{r.id ? 'Resume' : 'Upload'}</button>
                )}
                {r.state === 'uploading' && (
                  <button type="button" className="button" onClick={() => {
                    paused.current.add(r.key);
                    transfers.current.get(r.key)?.abort();
                  }}>Pause</button>
                )}
                {['ready', 'paused'].includes(r.state) && (
                  <button type="button" className="button" onClick={() => void cancel(r)}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </>}
        {notice && <p role="alert">{notice}</p>}
      </div>
    );
}
