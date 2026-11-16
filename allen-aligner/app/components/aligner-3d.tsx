
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Jaw = "Both" | "Upper" | "Lower";

type Tooth = {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  index: number;
  sign: number;
};

export default function Aligner3D() {
  const mount = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const upperRef = useRef<THREE.Group | null>(null);
  const lowerRef = useRef<THREE.Group | null>(null);
  const teethRef = useRef<Tooth[]>([]);

  const [jaw, setJaw] = useState<Jaw>("Both");
  const [stage, setStage] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = mount.current;
    if (!element) return;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
    } catch {
      setError("3D graphics are not available in this browser.");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#092535");

    const camera = new THREE.PerspectiveCamera(
      42,
      1,
      0.1,
      100
    );

    camera.position.set(0, -7.8, 7.1);

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    element.appendChild(renderer.domElement);

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 14;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.target.set(0, 0.25, 0);
    controls.update();

    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(
      "#ffffff",
      "#356174",
      2.0
    ));

    const light = new THREE.DirectionalLight(
      "#ffffff",
      3.2
    );
    light.position.set(4, -3, 8);
    scene.add(light);

    const fill = new THREE.DirectionalLight(
      "#89dce5",
      1.5
    );
    fill.position.set(-5, 3, 4);
    scene.add(fill);

    const toothMaterial = new THREE.MeshPhysicalMaterial({
      color: "#f4f9f7",
      roughness: 0.24,
      metalness: 0.02,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
    });

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: "#8ce3eb",
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const upper = new THREE.Group();
    const lower = new THREE.Group();

    upper.position.z = 0.7;
    lower.position.z = -0.75;

    scene.add(upper);
    scene.add(lower);

    upperRef.current = upper;
    lowerRef.current = lower;

    const crownGeometry = new THREE.SphereGeometry(
      0.32,
      24,
      20
    );

    function createJaw(
      group: THREE.Group,
      sign: number
    ) {
      const points: THREE.Vector3[] = [];

      for (let i = 0; i < 14; i++) {
        const angle =
          Math.PI * (0.08 + (i / 13) * 0.84);

        const x = 2.55 * Math.cos(angle);
        const y = 1.75 * Math.sin(angle) - 0.3;

        const base = new THREE.Vector3(x, y, 0);
        points.push(base.clone());

        const tooth = new THREE.Mesh(
          crownGeometry,
          toothMaterial
        );

        const isFront = i >= 5 && i <= 8;

        tooth.position.copy(base);
        tooth.scale.set(
          isFront ? 0.84 : 1.08,
          isFront ? 0.96 : 1.13,
          isFront ? 1.22 : 0.98
        );

        tooth.rotation.z = angle - Math.PI / 2;
        group.add(tooth);

        teethRef.current.push({
          mesh: tooth,
          base,
          index: i,
          sign,
        });
      }

      const curve = new THREE.CatmullRomCurve3(points);

      const shell = new THREE.Mesh(
        new THREE.TubeGeometry(
          curve,
          100,
          0.43,
          12,
          false
        ),
        shellMaterial
      );

      group.add(shell);
    }

    createJaw(upper, 1);
    createJaw(lower, -1);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.012, 8, 110),
      new THREE.MeshBasicMaterial({
        color: "#227b91",
        transparent: true,
        opacity: 0.45,
      })
    );

    ring.position.z = -1.8;
    scene.add(ring);

    function resize() {
      if (!element) return;

      const width = Math.max(element.clientWidth, 1);
      const height = Math.max(element.clientHeight, 1);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    let frame = 0;

    function animate() {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      controlsRef.current = null;
      upperRef.current = null;
      lowerRef.current = null;
      teethRef.current = [];

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
        }
      });

      crownGeometry.dispose();
      toothMaterial.dispose();
      shellMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (upperRef.current) {
      upperRef.current.visible = jaw !== "Lower";
    }

    if (lowerRef.current) {
      lowerRef.current.visible = jaw !== "Upper";
    }
  }, [jaw]);

  useEffect(() => {
    const fraction = stage / 4;

    teethRef.current.forEach((tooth) => {
      const displacementX =
        Math.sin(tooth.index * 1.8) *
        0.16 *
        fraction;

      const displacementY =
        Math.cos(tooth.index * 1.2) *
        0.1 *
        fraction;

      tooth.mesh.position.set(
        tooth.base.x + displacementX,
        tooth.base.y + displacementY,
        tooth.base.z
      );
    });
  }, [stage]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  const buttonStyle: React.CSSProperties = {
    padding: "10px 17px",
    borderRadius: 9,
    border: "1px solid #8cc5d0",
    background: "#ffffff",
    color: "#123f51",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <section
      aria-label="Interactive 3D aligner model"
      style={{
        padding: "65px 20px",
        background: "#f0f7f9",
      }}
    >
      <div style={{
        maxWidth: 1150,
        margin: "0 auto",
      }}>
        <p className="eyebrow">
          ALLEN ALIGNER — DIGITAL DENTISTRY
        </p>

        <h2 style={{
          fontSize: "clamp(28px, 4vw, 42px)",
          margin: "12px 0",
          color: "#14394b",
        }}>
          Explore a 3D Aligner Model
        </h2>

        <p style={{
          color: "#536e7a",
          maxWidth: 720,
          lineHeight: 1.7,
        }}>
          Rotate the dental arches, zoom in, and
          explore an illustrative stage-by-stage
          movement preview.
        </p>

        <div style={{
          borderRadius: 20,
          overflow: "hidden",
          background: "#092535",
          marginTop: 25,
        }}>
          <div
            ref={mount}
            style={{
              width: "100%",
              height: "clamp(320px, 48vw, 530px)",
              touchAction: "none",
            }}
          />

          {error && (
            <p style={{ color: "white", padding: 20 }}>
              {error}
            </p>
          )}

          <div style={{
            padding: "16px 20px",
            color: "#c2dee7",
            textAlign: "center",
            fontSize: 13,
          }}>
            Drag to rotate · Scroll to zoom · Interactive 3D
          </div>
        </div>

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 20,
        }}>
          {(["Both", "Upper", "Lower"] as Jaw[]).map(
            (value) => (
              <button
                key={value}
                type="button"
                onClick={() => setJaw(value)}
                aria-pressed={jaw === value}
                style={{
                  ...buttonStyle,
                  background:
                    jaw === value ? "#106c80" : "#fff",
                  color:
                    jaw === value ? "#fff" : "#123f51",
                }}
              >
                {value === "Both"
                  ? "Both Jaws"
                  : `${value} Jaw`}
              </button>
            )
          )}

          <button
            type="button"
            style={buttonStyle}
            aria-pressed={autoRotate}
            onClick={() =>
              setAutoRotate((previous) => !previous)
            }
          >
            {autoRotate
              ? "Pause Rotation"
              : "Auto Rotate"}
          </button>
        </div>

        <div style={{
          background: "#fff",
          border: "1px solid #d9e8ec",
          padding: 24,
          borderRadius: 14,
          marginTop: 20,
        }}>
          <label
            htmlFor="aligner-stage"
            style={{ fontWeight: 700 }}
          >
            Illustrative Stage: {stage} / 4
          </label>

          <input
            id="aligner-stage"
            type="range"
            min={0}
            max={4}
            step={1}
            value={stage}
            onChange={(event) =>
              setStage(Number(event.target.value))
            }
            style={{
              display: "block",
              width: "100%",
              marginTop: 20,
              accentColor: "#106c80",
            }}
          />

          <p style={{
            color: "#687d87",
            marginTop: 15,
            fontSize: 13,
          }}>
            Concept visualization only.
            This is not a patient-specific scan,
            clinical treatment plan, or
            medically validated tooth simulation.
          </p>
        </div>
      </div>
    </section>
  );
}
