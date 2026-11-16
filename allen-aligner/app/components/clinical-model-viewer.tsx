"use client";
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';

function parseOff(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  const format = lines.shift()?.toUpperCase();
  if (format !== 'OFF' && format !== 'COFF') throw Error('Invalid OFF model');
  const counts = (lines.shift() || '').split(/\s+/).map(Number);
  const [vertexCount, faceCount] = counts;
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 3 || !Number.isSafeInteger(faceCount) || faceCount < 1) throw Error('Invalid OFF model');
  const positions: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const vertex = (lines[i] || '').split(/\s+/).slice(0, 3).map(Number);
    if (vertex.length !== 3 || vertex.some(value => !Number.isFinite(value))) throw Error('Invalid OFF vertex');
    positions.push(...vertex);
  }
  const indices: number[] = [];
  for (let i = 0; i < faceCount; i++) {
    const face = (lines[vertexCount + i] || '').split(/\s+/).map(Number);
    const count = face[0];
    const vertices = face.slice(1);
    if (!Number.isInteger(count) || count < 3 || vertices.length !== count || vertices.some(index => !Number.isInteger(index) || index < 0 || index >= vertexCount)) throw Error('Invalid OFF face');
    for (let j = 1; j < vertices.length - 1; j++) indices.push(vertices[0], vertices[j], vertices[j + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export default function ClinicalModelViewer({ url, name, authorizationToken, onClose }: { url: string; name: string; authorizationToken?: string; onClose: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading original model…');
  const [resetCamera, setResetCamera] = useState<(() => void) | null>(null);
  useEffect(() => {
    const node = mount.current;
    if (!node) return;
    let disposed = false;
    const reportStatus = (message: string) => { if (!disposed) setStatus(message); };
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { reportStatus('3D graphics are not available in this browser.'); return () => { disposed = true; }; }
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#102c3a');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000); camera.position.set(0, -5, 4);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x466070, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, -4, 8); scene.add(light);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(node.clientWidth || 1, node.clientHeight || 1); node.appendChild(renderer.domElement);
    let model: THREE.Object3D | undefined;
    const extension = name.toLowerCase().split('.').pop();
    const loader = new THREE.LoadingManager();
    loader.setURLModifier(resource => /^(data|blob):/i.test(resource) ? resource : '');
    loader.onProgress = (_item, loaded, total) => reportStatus(total ? `Loading original model… ${Math.round(loaded / total * 100)}%` : 'Loading original model…');
    loader.onError = () => reportStatus('The model could not be read. Confirm it is a valid supported 3D file.');
    const material = () => new THREE.MeshStandardMaterial({ color: '#a9d7dc', roughness: 0.72, metalness: 0.03, side: THREE.DoubleSide });
    const done = (object: THREE.Object3D) => {
      if (disposed) return;
      model = object; scene.add(object);
      const bounds = new THREE.Box3().setFromObject(object), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z, 0.001); object.position.sub(center); const cameraPosition = new THREE.Vector3(max * 1.5, -max * 2, max * 1.5); camera.position.copy(cameraPosition); camera.near = max / 10000; camera.far = max * 100; camera.updateProjectionMatrix(); controls.target.set(0, 0, 0); controls.update(); setResetCamera(() => () => { camera.position.copy(cameraPosition); controls.target.set(0, 0, 0); controls.update(); }); reportStatus('Original source model loaded.');
    };
    const fail = () => reportStatus('The model could not be read. Confirm it is a valid STL, PLY, OBJ or GLB file.');
    const request = new XMLHttpRequest(); request.open('GET', url); if (authorizationToken) request.setRequestHeader('Authorization', `Bearer ${authorizationToken}`); request.responseType = 'arraybuffer'; request.onprogress = e => { if (e.lengthComputable) reportStatus(`Loading original model… ${Math.round(e.loaded / e.total * 100)}%`); }; request.onerror = fail; request.onload = () => {
      if (disposed) return;
      if (request.status < 200 || request.status >= 300) { fail(); return; }
      try {
        const bytes = request.response as ArrayBuffer;
        if (extension === 'stl') { const geometry = new STLLoader().parse(bytes); geometry.computeVertexNormals(); done(new THREE.Mesh(geometry, material())); }
        else if (extension === 'ply') { const geometry = new PLYLoader().parse(bytes); if (!geometry.getAttribute('position')) throw Error(); geometry.computeVertexNormals(); done(new THREE.Mesh(geometry, material())); }
        else if (extension === 'obj') { const text = new TextDecoder().decode(bytes); const object = new OBJLoader(loader).parse(text); object.traverse(child => { if (child instanceof THREE.Mesh) { child.material = material(); child.geometry.computeVertexNormals(); } }); done(object); }
        else if (extension === 'glb' || extension === 'gltf') new GLTFLoader(loader).parse(bytes, '', gltf => done(gltf.scene), fail);
        else if (extension === '3mf') done(new ThreeMFLoader(loader).parse(bytes));
        else if (extension === 'fbx') done(new FBXLoader(loader).parse(bytes, ''));
        else if (extension === 'dae') { const collada = new ColladaLoader(loader).parse(new TextDecoder().decode(bytes), ''); if (!collada) throw Error(); done(collada.scene); }
        else if (extension === 'wrl' || extension === 'vrml') done(new VRMLLoader(loader).parse(new TextDecoder().decode(bytes), ''));
        else if (extension === 'off') done(new THREE.Mesh(parseOff(new TextDecoder().decode(bytes)), material()));
        else fail();
      } catch { fail(); }
    }; request.send();
    let frame = 0; const render = () => { frame = requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); }; render();
    const observer = new ResizeObserver(() => { if (!node.clientWidth || !node.clientHeight) return; camera.aspect = node.clientWidth / node.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(node.clientWidth, node.clientHeight); }); observer.observe(node);
    return () => { disposed = true; request.abort(); cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); if (model) model.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); if (Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material.dispose(); } }); renderer.dispose(); renderer.domElement.remove(); };
  }, [authorizationToken, name, url]);
  return <div role="dialog" aria-modal="true" aria-label={`3D model viewer: ${name}`} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#081d27', color: 'white', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>{name} · original scan</strong><div style={{display:'flex',gap:8}}><button type="button" className="button" disabled={!resetCamera} onClick={() => resetCamera?.()}>Reset camera</button><button type="button" className="button" onClick={onClose}>Close viewer</button></div></div><div ref={mount} style={{ flex: 1, minHeight: 240, borderRadius: 12, overflow: 'hidden', touchAction: 'none' }} /><div role="status">{status} · Drag to rotate, right-click drag to pan, scroll to zoom.</div></div>;
}
