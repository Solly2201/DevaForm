"use client";

/**
 * Shiva on the human base — the candidate, in the real studio pipeline.
 *
 * This is the comparison route for the migration: the same Shiva
 * configuration the studio builds, with one part swapped for the human
 * mesh body, rendered through buildRig exactly as the product does. Every
 * ornament, garment, attribute and pose therefore has to fit the measured
 * human surfaces rather than the procedural body's formulas.
 *
 * Nothing here changes what the product offers: the human body is still
 * compatible with no deity, and the studio still builds the procedural
 * Shiva. This route exists so the two can be judged side by side before
 * that changes.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { subscribeGlbCache } from "@/engine/glbCache";
import { ZoneMaterials } from "@/engine/materials";
import { applyGestureOrientations, applyGripOrientations, applyPose } from "@/engine/pose";
import {
  alignUprightAttachments,
  buildRig,
  disposeRig,
  type CharacterRig,
} from "@/engine/rig";
import { resolveAssetRef } from "@devaform/asset-system";
import { applyMorphInfluences } from "@/engine/skinning";
import { morphInfluences } from "@/engine/morphs";

const HUMAN_BODY = "humanoid.body.human";
const HIDE_WRAP = "humanoid.garment.hideWrap";
const TRIPUNDRA = "humanoid.tilak.tripundra";
const NAGA = "shiva.ornament.naga";
/** The build this candidate is judged at — heroic frame, ascetic spare. */
const SHIVA_MORPHS = {
  bodyPowerful: 0.35,
  bodyHeroic: 0.85,
  bodyAscetic: 0.3,
  faceDivine: 1,
};

const VIEWS = {
  front: [0, 0.62, 1.9],
  threeQuarter: [1.35, 0.75, 1.4],
  side: [1.9, 0.62, 0],
  back: [0, 0.62, -1.9],
  face: [0, 0.95, 0.55],
  torso: [0, 0.75, 1.0],
  grip: [-0.45, 0.72, 0.52],
  drum: [0.40, 0.66, 0.40],
  naga: [0.30, 0.93, 0.34],
} as const;
type ViewId = keyof typeof VIEWS;
const TARGET: Record<ViewId, [number, number, number]> = {
  front: [0, 0.55, 0],
  threeQuarter: [0, 0.55, 0],
  side: [0, 0.55, 0],
  back: [0, 0.55, 0],
  face: [0, 0.93, 0],
  torso: [0, 0.72, 0],
  grip: [-0.23, 0.66, 0.19],
  drum: [0.24, 0.6, 0.06],
  naga: [0.05, 0.88, 0.03],
};

const POSES = ["shiva.standingStaff", "shiva.blessing", "shiva.meditation"] as const;

function humanShiva(preset: string, morphs: Record<string, number>): CharacterConfiguration {
  const base = createDefaultShivaConfiguration();
  return {
    ...base,
    parts: {
      ...base.parts,
      body: { assetId: HUMAN_BODY, version: 1 },
      lowerGarment: { assetId: HIDE_WRAP, version: 1 },
      // The reference shows a mane, not a topknot alone.
      hair: { assetId: "shiva.jata.flowing", version: 1 },
    },
    // The ash marks are their own ornament here: the procedural head
    // drew them, and this body has no procedural head.
    attachments: [
      ...base.attachments,
      { socket: "head.forehead" as const, asset: { assetId: TRIPUNDRA, version: 1 } },
      // The serpent is Shiva's, and an optional ornament like any other.
      { socket: "chest.necklace" as const, asset: { assetId: NAGA, version: 1 } },
    ],
    pose: { preset, jointOverrides: {} },
    morphs,
  };
}

function CameraRig({ view }: { view: ViewId }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const [x, y, z] = VIEWS[view];
    camera.position.set(x, y, z);
    camera.lookAt(...TARGET[view]);
  }, [camera, view]);
  return null;
}

function Statue({
  config,
  onReport,
}: {
  config: CharacterConfiguration;
  onReport: (lines: string[]) => void;
}) {
  const [glbVersion, setGlbVersion] = useState(0);
  useEffect(() => subscribeGlbCache(() => setGlbVersion((v) => v + 1)), []);
  const materials = useMemo(() => new ZoneMaterials(), []);

  const rig: CharacterRig = useMemo(() => {
    materials.applyConfiguration(config.materials);
    return buildRig(config, materials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, glbVersion, materials]);

  useEffect(() => () => disposeRig(rig), [rig]);

  // Dev-only handle so QA scripts can inspect where things actually landed.
  useEffect(() => {
    (window as unknown as { __devaformRig?: CharacterRig }).__devaformRig = rig;
  }, [rig]);

  useEffect(() => {
    applyPose(rig.joints, config.pose);
    applyGestureOrientations(rig.joints, config.hands);
    // Hands that are holding something are turned onto it before the
    // item is aligned, or the item lands between the fingers.
    applyGripOrientations(rig.joints, rig.held);
    // Planted attributes are re-verticalised after posing, exactly as
    // the studio does it — without this the trishul follows the wrist.
    alignUprightAttachments(rig);
    applyMorphInfluences(
      rig.root,
      morphInfluences(config.morphs, config.hands, resolveAssetRef(config.parts.body)),
    );
    const box = new THREE.Box3().setFromObject(rig.root);
    let triangles = 0;
    rig.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) triangles += (mesh.geometry.getIndex()?.count ?? 0) / 3;
    });
    onReport([
      `${triangles.toFixed(0)} tris`,
      `height ${((box.max.y - box.min.y) * 100).toFixed(1)} cm`,
      `neck r ${(rig.body.neckRadius * 100).toFixed(1)} cm`,
      `skirt r ${(rig.body.dhotiRadius * 100).toFixed(1)} cm`,
      ...rig.warnings,
    ]);
  }, [rig, config, onReport]);

  return <primitive object={rig.root} />;
}

export default function ShivaHumanPage() {
  const [view, setView] = useState<ViewId>("threeQuarter");
  const [preset, setPreset] = useState<string>(POSES[0]);
  const [divine, setDivine] = useState(true);
  const [report, setReport] = useState<string[]>([]);
  const config = useMemo(
    () => humanShiva(preset, divine ? SHIVA_MORPHS : {}),
    [preset, divine],
  );

  return (
    <div className="flex h-dvh flex-col bg-surface-950 text-stone-200">
      <header className="border-b border-surface-800 px-5 py-3">
        <h1 className="font-display text-lg text-stone-100">
          Shiva on the human base{" "}
          <span className="text-xs text-amber-500">(candidate — not the studio default)</span>
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
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`rounded-md px-2.5 py-1 text-xs ${p === preset ? "bg-saffron-500 font-semibold text-surface-950" : "bg-surface-850 text-stone-300"}`}
              >
                {p.replace("shiva.", "")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDivine((on) => !on)}
            className={`rounded-md px-2.5 py-1 text-xs ${divine ? "bg-saffron-500 font-semibold text-surface-950" : "bg-surface-850 text-stone-300"}`}
          >
            shiva morphs
          </button>
          <p className="text-[11px] text-stone-500">{report.join(" · ")}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Canvas shadows camera={{ position: [1.35, 0.75, 1.4], fov: 35, near: 0.01, far: 20 }}>
          <color attach="background" args={["#211d19"]} />
          <hemisphereLight color="#efe9e2" groundColor="#403830" intensity={0.85} />
          <directionalLight
            position={[2, 3, 2.5]}
            intensity={2.1}
            color="#fff0da"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
            shadow-camera-left={-1.2}
            shadow-camera-right={1.2}
            shadow-camera-top={1.6}
            shadow-camera-bottom={-0.4}
            shadow-camera-near={0.5}
            shadow-camera-far={8}
          />
          <directionalLight position={[-2, 2, -2]} intensity={0.85} color="#ffe4b0" />
          <Statue config={config} onReport={setReport} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[3, 48]} />
            <meshStandardMaterial color="#1a1512" roughness={0.95} />
          </mesh>
          <CameraRig view={view} />
          <OrbitControls target={TARGET[view]} minDistance={0.2} maxDistance={6} />
        </Canvas>
      </div>
    </div>
  );
}
