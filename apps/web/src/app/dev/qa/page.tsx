"use client";

/**
 * Visual QA capture surface.
 *
 * Renders one configuration from one camera, deterministically, and hands
 * the image to `scripts/qa-capture.mjs` on `window.__devaformQa`. Nothing
 * here is interactive: a QA render has to be the same picture every time
 * or comparing two of them says nothing.
 *
 * Driven entirely by the query string, so a sheet of views is a list of
 * URLs rather than a list of manual steps:
 *
 *   /dev/qa?deity=shiva&pose=shiva.standing&view=front
 *   /dev/qa?deity=ganesha&pose=blessing&view=side&focus=hands
 *
 * `focus` frames a region instead of the whole figure, because the
 * questions that actually need a render — does the fist close on the
 * shaft, does the serpent clear the neck — are not answerable from a
 * full-figure thumbnail.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";
import {
  ARM_SLOTS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  mudraArmRotations,
  type CharacterConfiguration,
  type Vec3,
} from "@devaform/character-schema";
import { resolveAssetRef } from "@devaform/asset-system";
import { getLightingPreset } from "@/engine/lighting";
import { ZoneMaterials } from "@/engine/materials";
import { buildRig, disposeRig, poseRig, rigWarnings } from "@/engine/rig";
import { applyMorphInfluences } from "@/engine/skinning";
import { morphInfluences } from "@/engine/morphs";
import { SceneEnvironment } from "@/engine/SceneEnvironment";
import { subscribeGlbCache } from "@/engine/glbCache";

/** Where the camera stands, as a bearing around the figure. */
const VIEWS: Record<string, number> = {
  front: 0,
  threeQuarter: 35,
  side: 90,
  back: 180,
  backThreeQuarter: 145,
};

/**
 * What to frame, named by the anatomy rather than by a fraction.
 *
 * A fraction of the figure's height only works for one set of
 * proportions: "hands at 52%" frames Ganesha's dhoti and Shiva's fists.
 * Each focus therefore names the JOINTS it is about, and the camera is
 * centred on where those joints actually ended up in this pose, on this
 * body. `span` stays a fraction of the figure — it is a zoom level, and a
 * zoom level is relative to the subject by definition.
 */
const FOCUS: Record<string, { joints: readonly string[] | null; span: number }> = {
  full: { joints: null, span: 1.3 },
  head: { joints: ["head"], span: 0.32 },
  torso: { joints: ["chest"], span: 0.5 },
  hands: {
    joints: [
      "arm.frontLeft.hand",
      "arm.frontRight.hand",
      "arm.backLeft.hand",
      "arm.backRight.hand",
    ],
    span: 0.5,
  },
  waist: { joints: ["pelvis"], span: 0.42 },
  feet: { joints: ["leg.left.foot", "leg.right.foot"], span: 0.35 },
};

function configFor(params: URLSearchParams): CharacterConfiguration {
  const deity = params.get("deity") ?? "shiva";
  const config =
    deity === "ganesha"
      ? createDefaultGaneshaConfiguration()
      : createDefaultShivaConfiguration();
  const pose = params.get("pose");
  if (pose) {
    // Exactly what the editor does when a pose is chosen: the preset
    // replaces the joints, and any hand already set to a gesture brings
    // its own arm with it. Building the config by hand instead would make
    // QA render a state the product never produces.
    const jointOverrides: Record<string, Vec3> = {};
    for (const slot of ARM_SLOTS) {
      Object.assign(
        jointOverrides,
        mudraArmRotations(config.hands[slot]?.mudra ?? "open", slot) ?? {},
      );
    }
    config.pose = { preset: pose, jointOverrides };
  }
  const body = params.get("body");
  if (body) config.parts.body = { assetId: body, version: 1 };
  const arms = params.get("arms");
  if (arms === "2" || arms === "4") config.arms = { count: Number(arms) as 2 | 4 };
  const morphs = params.get("morphs");
  if (morphs) {
    config.morphs = Object.fromEntries(
      morphs.split(",").map((pair) => {
        const [name, value] = pair.split(":");
        return [name ?? "", Number(value ?? 0)];
      }),
    );
  }
  const drop = params.get("without");
  if (drop) {
    const ids = new Set(drop.split(","));
    config.attachments = config.attachments.filter((a) => !ids.has(a.asset.assetId));
    for (const [slot, ref] of Object.entries(config.parts)) {
      if (ref && ids.has(ref.assetId)) {
        (config.parts as Record<string, unknown>)[slot] = null;
      }
    }
  }
  return config;
}

function Figure({
  config,
  focus,
  onReady,
}: {
  config: CharacterConfiguration;
  focus: readonly string[] | null;
  onReady: (report: { warnings: string[]; height: number; centre: number }) => void;
}) {
  const [glbVersion, setGlbVersion] = useState(0);
  useEffect(() => subscribeGlbCache(() => setGlbVersion((v) => v + 1)), []);
  const materialsRef = useRef<ZoneMaterials | null>(null);
  materialsRef.current ??= new ZoneMaterials();
  const materials = materialsRef.current;

  const rig = useMemo(() => {
    const built = buildRig(config, materials);
    materials.applyConfiguration(config.materials);
    applyMorphInfluences(
      built.root,
      morphInfluences(config.morphs, built.hands, resolveAssetRef(config.parts.body)),
    );
    poseRig(built);
    built.root.updateWorldMatrix(true, true);
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, materials, glbVersion]);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(rig.root);
    // Where the thing being looked at actually is — read off the posed
    // rig, so a close-up of the hands is a close-up of THESE hands.
    const found = (focus ?? [])
      .map((id) => rig.joints.get(id as never))
      .filter((joint): joint is THREE.Object3D => joint !== undefined)
      .map((joint) => joint.getWorldPosition(new THREE.Vector3()).y);
    const centre =
      found.length > 0
        ? found.reduce((total, y) => total + y, 0) / found.length
        : box.max.y * 0.5;
    onReady({ warnings: rigWarnings(rig), height: box.max.y, centre });
  }, [rig, focus, onReady]);

  useEffect(() => {
    const previous = rig;
    return () => disposeRig(previous);
  }, [rig]);

  return <primitive object={rig.root} />;
}

/**
 * Frames the figure that was actually built.
 *
 * The camera cannot be set from a Canvas prop here: the frame depends on
 * the statue's measured height, which is not known until the rig exists,
 * and a camera prop is read once at creation. So the camera is moved from
 * inside the scene, and the capture waits until it has been.
 */
function Frame({
  bearing,
  centre,
  span,
  onFramed,
}: {
  bearing: number;
  centre: number;
  span: number;
  onFramed: () => void;
}) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const vertical = (perspective.fov * Math.PI) / 180;
    // Fit the span in whichever direction is tighter, so a portrait frame
    // does not crop a wide pose and a square one does not crop a tall
    // figure.
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * perspective.aspect);
    const distance = span / (2 * Math.tan(Math.min(vertical, horizontal) / 2));
    // Level with the centre of the frame. A camera raised above its own
    // target tilts down, which crops the top of whatever it was framing —
    // which is how a crown ends up outside a full-figure QA view.
    camera.position.set(Math.sin(bearing) * distance, centre, Math.cos(bearing) * distance);
    camera.lookAt(0, centre, 0);
    camera.updateProjectionMatrix();
    onFramed();
  }, [camera, bearing, centre, span, onFramed]);
  return null;
}

export default function QaCapturePage() {
  const params = useSearchParams();
  const config = useMemo(() => configFor(new URLSearchParams(params.toString())), [params]);
  const view = VIEWS[params.get("view") ?? "front"] ?? 0;
  const focus = FOCUS[params.get("focus") ?? "full"] ?? FOCUS.full!;
  const [report, setReport] = useState<{
    warnings: string[];
    height: number;
    centre: number;
  } | null>(null);
  const preset = getLightingPreset("studio");

  // The figure is a metre tall by construction, but a proportions slider
  // or a raised trishul can change what "the whole thing" means — so the
  // frame is computed from the built scene rather than assumed.
  const height = report?.height ?? 1;
  const centre = report?.centre ?? height * 0.5;
  const span = height * focus.span;
  const bearing = (view * Math.PI) / 180;
  const [framed, setFramed] = useState(false);
  const onFramed = useMemo(() => () => setFramed(true), []);

  useEffect(() => {
    if (!report || !framed) return;
    // Let the framed camera render, then read the buffer: the canvas is
    // created with preserveDrawingBuffer so the last frame survives.
    const timer = setTimeout(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas");
      const w = window as unknown as Record<string, unknown>;
      w.__devaformQaWarnings = report.warnings;
      w.__devaformQa = canvas?.width ? canvas.toDataURL("image/png") : "FAILED";
    }, 500);
    return () => clearTimeout(timer);
  }, [report, framed, view, focus]);

  return (
    <div className="h-dvh w-dvw bg-[#14100d]">
      <Canvas
        shadows
        dpr={1}
        camera={{ position: [0, 0.6, 2], fov: 38, near: 0.02, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="h-full w-full"
      >
        <Frame bearing={bearing} centre={centre} span={span} onFramed={onFramed} />
        <color attach="background" args={[preset.background]} />
        <SceneEnvironment intensity={preset.envIntensity} />
        <hemisphereLight
          color={preset.hemisphere.sky}
          groundColor={preset.hemisphere.ground}
          intensity={preset.hemisphere.intensity}
        />
        {preset.directionals.map((light, index) => (
          <directionalLight
            key={index}
            position={light.position}
            intensity={light.intensity}
            color={light.color}
            castShadow={light.castShadow ?? false}
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0012}
          />
        ))}
        <Figure config={config} focus={focus.joints} onReady={setReport} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
          <circleGeometry args={[2.4, 48]} />
          <meshStandardMaterial color="#1a1512" roughness={0.95} />
        </mesh>
      </Canvas>
    </div>
  );
}
