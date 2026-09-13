"use client";

/**
 * Stage-0 engine spike harness — skinned mesh + morph targets.
 *
 * Drives the GENERIC engine capability (glbCache cloning, skinning.ts
 * binding/morphs/bake, the existing pose system) against the deterministic
 * test fixture in /public/spike. Nothing here is product code: no deity,
 * no manifest, no registry, no configuration persistence.
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { HUMANOID_SKELETON, type JointId } from "@devaform/character-schema";
import { applyPose } from "@/engine/pose";
import { buildJointHierarchy } from "@/engine/rig";
import {
  applyMorphInfluences,
  bakeSceneForExport,
  bindSkinnedMeshToJoints,
  collectSkinnedMeshes,
} from "@/engine/skinning";

const BEND_JOINT: JointId = "arm.frontLeft.forearm";

interface InstanceState {
  spikeBulge: number;
  spikeFlare: number;
  bend: number;
}

const NEUTRAL: InstanceState = { spikeBulge: 0, spikeFlare: 0, bend: 0 };

/** The A–G matrix from the spike brief, as one-click reproducible states. */
const SCENARIOS: ReadonlyArray<{ id: string; label: string; a: InstanceState; b: InstanceState }> = [
  { id: "A", label: "A · neutral", a: NEUTRAL, b: NEUTRAL },
  { id: "B", label: "B · morph A", a: { ...NEUTRAL, spikeBulge: 1 }, b: NEUTRAL },
  { id: "C", label: "C · morph B", a: { ...NEUTRAL, spikeFlare: 1 }, b: NEUTRAL },
  { id: "D", label: "D · A+B", a: { spikeBulge: 1, spikeFlare: 1, bend: 0 }, b: NEUTRAL },
  { id: "E", label: "E · pose", a: { ...NEUTRAL, bend: -1.9 }, b: NEUTRAL },
  { id: "F", label: "F · morph+pose", a: { spikeBulge: 1, spikeFlare: 1, bend: -1.9 }, b: NEUTRAL },
  {
    id: "G",
    label: "G · two instances differ",
    a: { spikeBulge: 1, spikeFlare: 0, bend: -1.9 },
    b: { spikeBulge: 0, spikeFlare: 1, bend: -0.4 },
  },
];

interface Built {
  characterRoot: THREE.Group;
  joints: Map<JointId, THREE.Object3D>;
  warnings: string[];
  bound: boolean;
}

function buildInstance(scene: THREE.Group, tint: string): Built {
  const { characterRoot, joints } = buildJointHierarchy(HUMANOID_SKELETON);
  const warnings: string[] = [];
  const material = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5 });
  let bound = false;
  // Same clone path the engine uses for skinned GLB assets.
  const instance = cloneSkinned(scene);
  for (const mesh of collectSkinnedMeshes(instance)) {
    characterRoot.add(mesh);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.material = material;
    bound = bindSkinnedMeshToJoints(mesh, joints, characterRoot, warnings, "spike") || bound;
  }
  return { characterRoot, joints, warnings, bound };
}

function Instance({
  scene,
  state,
  offsetX,
  tint,
  onStats,
}: {
  scene: THREE.Group;
  state: InstanceState;
  offsetX: number;
  tint: string;
  onStats?: (stats: { triangles: number; height: number; reach: number }) => void;
}) {
  const built = useMemo(() => buildInstance(scene, tint), [scene, tint]);

  useEffect(() => {
    applyMorphInfluences(built.characterRoot, {
      spikeBulge: state.spikeBulge,
      spikeFlare: state.spikeFlare,
    });
    applyPose(built.joints, {
      preset: null,
      jointOverrides: { [BEND_JOINT]: [state.bend, 0, 0] },
    });
    if (!onStats) return;
    // Bake exactly as the STL exporter does, and report the deformed size.
    const { group, dispose } = bakeSceneForExport(built.characterRoot);
    const box = new THREE.Box3().setFromObject(group);
    let triangles = 0;
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) triangles += (mesh.geometry.getIndex()?.count ?? 0) / 3;
    });
    onStats({
      triangles,
      height: (box.max.y - box.min.y) * 1000,
      reach: (box.max.z - box.min.z) * 1000,
    });
    dispose();
  }, [built, state, onStats]);

  return <primitive object={built.characterRoot} position={[offsetX, 0, 0]} />;
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-stone-300">
      <span className="w-24">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="w-12 tabular-nums text-stone-500">{value.toFixed(2)}</span>
    </label>
  );
}

export default function SkinnedSpikePage() {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<InstanceState>(NEUTRAL);
  const [b, setB] = useState<InstanceState>(NEUTRAL);
  const [scenario, setScenario] = useState("A");
  const [stats, setStats] = useState<{ triangles: number; height: number; reach: number } | null>(
    null,
  );

  useEffect(() => {
    new GLTFLoader().load(
      "/spike/skinned-limb.glb",
      (gltf) => setScene(gltf.scene),
      undefined,
      () => setError("Failed to load /spike/skinned-limb.glb"),
    );
  }, []);

  const applyScenario = (id: string) => {
    const found = SCENARIOS.find((s) => s.id === id);
    if (!found) return;
    setScenario(id);
    setA(found.a);
    setB(found.b);
  };

  return (
    <div className="flex h-dvh flex-col bg-surface-950 text-stone-200">
      <header className="border-b border-surface-800 px-5 py-3">
        <h1 className="font-display text-lg text-stone-100">
          Skinned + Morph Engine Spike{" "}
          <span className="text-xs text-amber-500">(Stage 0 — generic engine test, not product)</span>
        </h1>
        <div className="mt-2 flex flex-wrap gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => applyScenario(s.id)}
              className={`rounded-md px-3 py-1 text-xs ${
                s.id === scenario
                  ? "bg-saffron-500 font-semibold text-surface-950"
                  : "bg-surface-850 text-stone-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-stone-500">Instance A</p>
            <Slider label="spikeBulge" value={a.spikeBulge} min={0} max={1} onChange={(v) => setA({ ...a, spikeBulge: v })} />
            <Slider label="spikeFlare" value={a.spikeFlare} min={0} max={1} onChange={(v) => setA({ ...a, spikeFlare: v })} />
            <Slider label="elbow bend" value={a.bend} min={-2.6} max={0} onChange={(v) => setA({ ...a, bend: v })} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-stone-500">Instance B</p>
            <Slider label="spikeBulge" value={b.spikeBulge} min={0} max={1} onChange={(v) => setB({ ...b, spikeBulge: v })} />
            <Slider label="spikeFlare" value={b.spikeFlare} min={0} max={1} onChange={(v) => setB({ ...b, spikeFlare: v })} />
            <Slider label="elbow bend" value={b.bend} min={-2.6} max={0} onChange={(v) => setB({ ...b, bend: v })} />
          </div>
          <div className="text-[11px] text-stone-400">
            <p className="uppercase tracking-wide text-stone-500">STL bake (instance A)</p>
            {stats ? (
              <>
                <p>{stats.triangles} triangles baked</p>
                <p>deformed height {stats.height.toFixed(1)} mm</p>
                <p>deformed depth {stats.reach.toFixed(1)} mm</p>
              </>
            ) : (
              <p>—</p>
            )}
            {error && <p className="text-red-400">{error}</p>}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Canvas camera={{ position: [0.62, 0.86, 0.92], fov: 40, near: 0.01, far: 20 }}>
          <color attach="background" args={["#1d1a17"]} />
          <hemisphereLight color="#efe9e2" groundColor="#403830" intensity={0.9} />
          <directionalLight position={[1.5, 2.5, 2]} intensity={2.2} color="#fff0da" />
          <directionalLight position={[-1.5, 1.5, -2]} intensity={0.8} color="#ffe4b0" />
          <gridHelper args={[2, 20, "#3a332c", "#2a251f"]} />
          {scene && (
            <>
              <Instance scene={scene} state={a} offsetX={0} tint="#c9b79c" onStats={setStats} />
              <Instance scene={scene} state={b} offsetX={0.42} tint="#8fa9c2" />
            </>
          )}
          <OrbitControls target={[0.28, 0.74, 0]} minDistance={0.15} maxDistance={4} />
        </Canvas>
      </div>
    </div>
  );
}
