"use client";
import { useState } from 'react';
import ClinicalModelViewer from './clinical-model-viewer';

type FileRef = { id: string; name: string; url: string; previewUrl?: string };
const previewableModel = /\.(stl|ply|obj|glb|gltf|3mf|wrl|vrml|dae|fbx|off)$/i;
export default function PlanFilesViewer({ files }: { files: FileRef[] }) {
  const [active, setActive] = useState<FileRef | null>(null);
  const models = files.filter(file => file.previewUrl && previewableModel.test(file.name));
  return <>
    <ul>{files.map(file => <li key={file.id}>
      {file.previewUrl && previewableModel.test(file.name)
        ? <><button type="button" className="text-link" onClick={() => setActive(file)}>Open 3D model: {file.name}</button>{' · '}<a href={file.url}>Download original</a></>
        : <a href={file.url}>{file.name}</a>}
    </li>)}</ul>
    {models.length === 0 && <p>No supported 3D models are attached to this plan version.</p>}
    {active?.previewUrl && <ClinicalModelViewer key={active.id} url={active.previewUrl} name={active.name} onClose={() => setActive(null)} />}
  </>;
}
