"use client";

/**
 * PROOF-OF-CONCEPT — MakeHuman base-mesh visual evaluation. NOT PRODUCT CODE.
 *
 * Displays naked human base candidates exported from official MakeHuman
 * 1.2.0 (files under /public/poc/humanbase/) so we can judge whether the
 * MakeHuman anatomy is good enough to become DevaForm's parametric human
 * foundation. Deliberately isolated: no registry, no manifest, no rig, no
 * BodyProfile — just an honest clay render of the raw meshes.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

const CANDIDATES = ["neutral", "lean", "athletic", "powerful"] as const;
type Candidate = (typeof CANDIDATES)[number];

const VIEWS = {
  front: [0, 0.92, 3.1],
  threeQuarter: [2.2, 1.05, 2.3],
  side: [3.1, 0.92, 0],
  back: [0, 0.92, -3.1],
  face: [0, 1.55, 0.85],
} as const;
type ViewId = keyof typeof VIEWS;

/** Honest clay material — no rim tricks, no texture, flat studio look. */
const clay = new THREE.MeshStandardMaterial({ color: "#b7aea2", roughness: 0.62, metalness: 0.02 });

function HumanMesh({ candidate }: { candidate: Candidate }) {
  const [object, setObject] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    new OBJLoader().load(`/poc/humanbase/human-${candidate}.obj`, (loaded) => {
      if (cancelled) return;
      loaded.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = clay;
          // OBJLoader emits non-indexed triangles → flat facets. Re-index
          // so shared vertices get true smooth normals (the surface the
          // topology actually defines — no beautification).
          o.geometry = mergeVertices(o.geometry);
          o.geometry.computeVertexNormals();
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      // Normalize: MakeHuman exports in decimetres — scale to metres and
      // stand the figure on the ground plane.
      const box = new THREE.Box3().setFromObject(loaded);
      const height = box.max.y - box.min.y;
      const scale = 1.75 / height;
      loaded.scale.setScalar(scale);
      const scaledBox = new THREE.Box3().setFromObject(loaded);
      loaded.position.y -= scaledBox.min.y;
      loaded.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
      loaded.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;
      setObject(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  return object ? <primitive object={object} /> : null;
}

function CameraRig({ view }: { view: ViewId }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const [x, y, z] = VIEWS[view];
    camera.position.set(x, y, z);
    camera.lookAt(0, view === "face" ? 1.55 : 0.88, 0);
  }, [camera, view]);
  return null;
}

export default function HumanBasePocPage() {
  const [candidate, setCandidate] = useState<Candidate>("neutral");
  const [view, setView] = useState<ViewId>("front");
  const target = useMemo<[number, number, number]>(
    () => (view === "face" ? [0, 1.55, 0] : [0, 0.88, 0]),
    [view],
  );

  return (
    <div className="flex h-dvh flex-col bg-surface-950 text-stone-200">
      <header className="flex flex-wrap items-center gap-4 border-b border-surface-800 px-5 py-3">
        <h1 className="font-display text-lg text-stone-100">
          Human Base POC <span className="text-xs text-amber-500">(MakeHuman evaluation — not product)</span>
        </h1>
        <div className="flex gap-1">
          {CANDIDATES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCandidate(c)}
              className={`rounded-md px-3 py-1 text-xs capitalize ${
                c === candidate ? "bg-saffron-500 font-semibold text-surface-950" : "bg-surface-850 text-stone-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(Object.keys(VIEWS) as ViewId[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-xs ${
                v === view ? "bg-stone-200 font-semibold text-surface-950" : "bg-surface-850 text-stone-300"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Canvas shadows camera={{ position: [0, 0.92, 3.1], fov: 35, near: 0.05, far: 50 }}>
          <color attach="background" args={["#211d19"]} />
          <hemisphereLight color="#efe9e2" groundColor="#403830" intensity={0.85} />
          <directionalLight position={[2.5, 4, 3]} intensity={2.0} color="#fff0da" castShadow />
          <directionalLight position={[-2, 2.5, -3]} intensity={0.9} color="#ffe4b0" />
          <Suspense fallback={null}>
            <HumanMesh candidate={candidate} />
          </Suspense>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[4, 48]} />
            <meshStandardMaterial color="#1a1512" roughness={0.95} />
          </mesh>
          <CameraRig view={view} />
          <OrbitControls target={target} enablePan={false} minDistance={0.4} maxDistance={8} />
        </Canvas>
      </div>
    </div>
  );
}
