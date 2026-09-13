"use client";

/**
 * Human base inspection route — the production GLB through the real engine.
 *
 * Builds the human-proportioned skeleton, loads the registered asset via
 * the normal GLB cache, binds it with the generic skinning path, and drives
 * morphs and poses exactly as the studio does. Isolated from the product:
 * no deity yet consumes this body.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  HUMAN_SKELETON,
  getPosePreset,
  type JointId,
  type PoseConfiguration,
} from "@devaform/character-schema";
import { getAsset } from "@devaform/asset-system";
import { getGlb, instantiateGlb, subscribeGlbCache } from "@/engine/glbCache";
import { ZoneMaterials } from "@/engine/materials";
import { applyGestureOrientations, applyPose } from "@/engine/pose";
import { buildJointHierarchy } from "@/engine/rig";
import {
  applyMorphInfluences,
  bakeSceneForExport,
  bindSkinnedMeshToJoints,
  collectSkinnedMeshes,
} from "@/engine/skinning";

const ASSET_ID = "humanoid.body.human";
// The asset declares what it can do; this route never hardcodes a list.
const MORPHS: readonly string[] = getAsset(ASSET_ID)?.morphTargets ?? [];

const VIEWS = {
  front: [0, 0.62, 1.9],
  threeQuarter: [1.35, 0.75, 1.4],
  side: [1.9, 0.62, 0],
  back: [0, 0.62, -1.9],
  face: [0, 0.95, 0.55],
} as const;
type ViewId = keyof typeof VIEWS;

const POSES: ReadonlyArray<{ id: string; label: string; pose: PoseConfiguration }> = [
  { id: "rest", label: "rest", pose: { preset: null, jointOverrides: {} } },
  { id: "standing", label: "standing", pose: { preset: "shiva.standing", jointOverrides: {} } },
  { id: "meditation", label: "meditation", pose: { preset: "shiva.meditation", jointOverrides: {} } },
  { id: "blessing", label: "blessing", pose: { preset: "shiva.blessing", jointOverrides: {} } },
  {
    id: "armRaise",
    label: "arm raise",
    pose: {
      preset: null,
      jointOverrides: { "arm.frontRight.upper": [0, 0, -1.5] as [number, number, number] },
    },
  },
  {
    id: "elbow",
    label: "elbow bend",
    pose: {
      preset: null,
      jointOverrides: { "arm.frontRight.forearm": [-2.0, 0, 0] as [number, number, number] },
    },
  },
  {
    id: "knee",
    label: "knee bend",
    pose: {
      preset: null,
      jointOverrides: {
        "leg.left.thigh": [-1.0, 0, 0] as [number, number, number],
        "leg.left.shin": [1.4, 0, 0] as [number, number, number],
      },
    },
  },
];

function CameraRig({ view }: { view: ViewId }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const [x, y, z] = VIEWS[view];
    camera.position.set(x, y, z);
    camera.lookAt(0, view === "face" ? 0.93 : 0.55, 0);
  }, [camera, view]);
  return null;
}

function HumanBody({
  weights,
  pose,
  onReport,
}: {
  weights: Record<string, number>;
  pose: PoseConfiguration;
  onReport: (report: string[]) => void;
}) {
  const [glbVersion, setGlbVersion] = useState(0);
  useEffect(() => subscribeGlbCache(() => setGlbVersion((v) => v + 1)), []);
  const materials = useMemo(() => new ZoneMaterials(), []);

  const built = useMemo(() => {
    const asset = getAsset(ASSET_ID);
    const path = asset?.source.kind === "glb" ? asset.source.path : null;
    const { characterRoot, joints } = buildJointHierarchy(HUMAN_SKELETON);
    const notes: string[] = [];
    if (!path) return { characterRoot, joints, notes: ["asset not registered"] };
    const entry = getGlb(path);
    if (entry.status !== "loaded") return { characterRoot, joints, notes: ["loading…"] };
    materials.applyConfiguration({
      skin: { color: "#c9bda9", finish: "satin" },
      skinSecondary: { color: "#b6a892", finish: "satin" },
      hair: { color: "#31241a", finish: "matte" },
      garment: { color: "#9c1c20", finish: "satin" },
      garmentAccent: { color: "#d99b26", finish: "satin" },
      metal: { color: "#e8ae32", finish: "metallic" },
      gem: { color: "#b81e2d", finish: "polished" },
      base: { color: "#7d5c3a", finish: "satin" },
    });
    const instance = instantiateGlb(entry.scene, materials);
    for (const mesh of collectSkinnedMeshes(instance)) {
      characterRoot.add(mesh);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      bindSkinnedMeshToJoints(mesh, joints, characterRoot, notes, "human base");
    }
    return { characterRoot, joints, notes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glbVersion, materials]);

  useEffect(() => {
    applyMorphInfluences(built.characterRoot, weights);
    applyPose(built.joints as ReadonlyMap<JointId, THREE.Object3D>, pose);
    applyGestureOrientations(built.joints as ReadonlyMap<JointId, THREE.Object3D>, {
      frontLeft: { mudra: "open" },
      frontRight: { mudra: "open" },
      backLeft: { mudra: "open" },
      backRight: { mudra: "open" },
    });
    const { group, dispose } = bakeSceneForExport(built.characterRoot);
    const box = new THREE.Box3().setFromObject(group);
    let triangles = 0;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) triangles += (mesh.geometry.getIndex()?.count ?? 0) / 3;
    });
    dispose();
    onReport([
      ...built.notes,
      `${triangles} tris`,
      `height ${((box.max.y - box.min.y) * 100).toFixed(1)} cm`,
      `width ${((box.max.x - box.min.x) * 100).toFixed(1)} cm`,
    ]);
  }, [built, weights, pose, onReport]);

  return <primitive object={built.characterRoot} />;
}

export default function HumanBasePage() {
  const [view, setView] = useState<ViewId>("front");
  const [poseId, setPoseId] = useState("rest");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [report, setReport] = useState<string[]>([]);
  const pose = POSES.find((p) => p.id === poseId)?.pose ?? POSES[0]!.pose;

  useEffect(() => {
    if (poseId !== "rest" && POSES.find((p) => p.id === poseId)?.pose.preset) {
      // Presets referenced here must exist, or the pose silently rests.
      const preset = POSES.find((p) => p.id === poseId)!.pose.preset!;
      if (!getPosePreset(preset)) console.warn("missing preset", preset);
    }
  }, [poseId]);

  return (
    <div className="flex h-dvh flex-col bg-surface-950 text-stone-200">
      <header className="border-b border-surface-800 px-5 py-3">
        <h1 className="font-display text-lg text-stone-100">
          Human Base <span className="text-xs text-amber-500">(production asset — evaluation route)</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex gap-1">
            {(Object.keys(VIEWS) as ViewId[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-xs ${v === view ? "bg-stone-200 font-semibold text-surface-950" : "bg-surface-850 text-stone-300"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {POSES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPoseId(p.id)}
                className={`rounded-md px-2.5 py-1 text-xs ${p.id === poseId ? "bg-saffron-500 font-semibold text-surface-950" : "bg-surface-850 text-stone-300"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            {MORPHS.map((morph) => (
              <label key={morph} className="flex items-center gap-1 text-[11px] text-stone-400">
                {morph.replace("body", "")}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weights[morph] ?? 0}
                  onChange={(e) => setWeights({ ...weights, [morph]: Number(e.target.value) })}
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => setWeights({})}
              className="rounded-md bg-surface-850 px-2 py-1 text-[11px] text-stone-300"
            >
              reset
            </button>
          </div>
          <p className="text-[11px] text-stone-500">{report.join(" · ")}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Canvas shadows camera={{ position: [0, 0.62, 1.9], fov: 35, near: 0.01, far: 20 }}>
          <color attach="background" args={["#211d19"]} />
          <hemisphereLight color="#efe9e2" groundColor="#403830" intensity={0.85} />
          <directionalLight position={[2, 3, 2.5]} intensity={2.1} color="#fff0da" castShadow />
          <directionalLight position={[-2, 2, -2]} intensity={0.85} color="#ffe4b0" />
          <HumanBody weights={weights} pose={pose} onReport={setReport} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[3, 48]} />
            <meshStandardMaterial color="#1a1512" roughness={0.95} />
          </mesh>
          <CameraRig view={view} />
          <OrbitControls
            target={view === "face" ? [0, 0.93, 0] : [0, 0.55, 0]}
            minDistance={0.2}
            maxDistance={6}
          />
        </Canvas>
      </div>
    </div>
  );
}
