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
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";
import {
  ARM_SLOTS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  mudraArmRotations,
  type CharacterConfiguration,
  type Vec3,
} from "@devaform/character-schema";
import { getLightingPreset } from "@/engine/lighting";
import { ZoneMaterials } from "@/engine/materials";
import {
  buildRig,
  disposeRig,
  poseRig,
  rigMorphInfluences,
  rigWarnings,
  type CharacterRig,
} from "@/engine/rig";
import { applyMorphInfluences } from "@/engine/skinning";
import { SceneEnvironment } from "@/engine/SceneEnvironment";
import { subscribeGlbCache } from "@/engine/glbCache";

/**
 * The camera, as ONE object.
 *
 * Not an inline literal on <Canvas>. A fresh literal every render makes
 * react-three-fiber reconcile a fresh camera, so the component that
 * frames the shot and the loop that draws it end up holding different
 * cameras — and the sheet comes back framed on whatever the first,
 * unmeasured render guessed, while every report says otherwise. Three QA
 * runs were read as geometry bugs before the frames were compared with
 * the pixels.
 */
const CAMERA = { position: [0, 0.6, 2] as [number, number, number], fov: 38, near: 0.02, far: 50 };

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
  // One hand at a time, close enough to see the fingers: a frame that
  // holds every hand at once holds none of them near enough to judge
  // whether the fingers are actually round the thing they hold.
  rightHand: { joints: ["arm.frontRight.hand"], span: 0.2 },
  leftHand: { joints: ["arm.frontLeft.hand"], span: 0.2 },
  backRightHand: { joints: ["arm.backRight.hand"], span: 0.2 },
  backLeftHand: { joints: ["arm.backLeft.hand"], span: 0.2 },
  // The arm ROOTS, where a copied limb meets a torso it was not grown
  // from. The defect this frames is invisible from the front.
  backShoulders: {
    joints: ["arm.backLeft.upper", "arm.backRight.upper"],
    span: 0.42,
  },
  backLeftShoulder: { joints: ["arm.backLeft.upper"], span: 0.26 },
  backRightShoulder: { joints: ["arm.backRight.upper"], span: 0.26 },
  shoulders: { joints: ["arm.frontLeft.upper", "arm.frontRight.upper"], span: 0.42 },
  waist: { joints: ["pelvis"], span: 0.42 },
  feet: { joints: ["leg.left.foot", "leg.right.foot"], span: 0.35 },
};

/**
 * How tall the body's own geometry is, in the posed scene.
 *
 * Not "is there a body asset" — whether there is a BODY: a figure a
 * metre high, in the frame, with its skin on. The capture is a
 * photograph, so the check is the one a photograph can fail.
 */
function bodyHeight(rig: CharacterRig): number {
  if (rig.bodyMeshes.length === 0) return 0;
  const box = new THREE.Box3();
  for (const mesh of rig.bodyMeshes) box.expandByObject(mesh);
  return box.isEmpty() ? 0 : box.max.y - box.min.y;
}

function configFor(params: URLSearchParams): CharacterConfiguration {
  const deity = params.get("deity") ?? "shiva";
  const config =
    deity === "ganesha"
      ? createDefaultGaneshaConfiguration()
      : deity === "vishnu"
        ? createDefaultVishnuConfiguration()
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
  onReady: (report: {
    warnings: string[];
    height: number;
    centre: { x: number; y: number };
    pending: string[];
  }) => void;
}) {
  const [glbVersion, setGlbVersion] = useState(0);
  useEffect(() => subscribeGlbCache(() => setGlbVersion((v) => v + 1)), []);
  const materialsRef = useRef<ZoneMaterials | null>(null);
  materialsRef.current ??= new ZoneMaterials();
  const materials = materialsRef.current;

  const rig = useMemo(() => {
    const built = buildRig(config, materials);
    materials.applyConfiguration(config.materials);
    applyMorphInfluences(built.root, rigMorphInfluences(built, config.morphs));
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
      .map((joint) => joint.getWorldPosition(new THREE.Vector3()));
    // Where the thing is, not just how high it is. A hand hangs at the
    // side of the figure, and a frame centred on the midline puts it off
    // the edge however tightly the span is drawn.
    const centre =
      found.length > 0
        ? {
            x: found.reduce((total, p) => total + p.x, 0) / found.length,
            y: found.reduce((total, p) => total + p.y, 0) / found.length,
          }
        : { x: 0, y: box.max.y * 0.5 };
    onReady({
      warnings: rigWarnings(rig),
      height: box.max.y,
      centre,
      // A GLB that fails to load is not "pending" — the cache remembers
      // the failure and the rig carries on without it. A dev server that
      // was recompiling when the page asked for the body answers exactly
      // that way, and the capture that follows is a photograph of a
      // costume with nobody in it.
      //
      // Asking whether the body EXISTS is not enough: one sheet in
      // seventy-four came back with the rig reporting a body and the
      // render showing ornaments hanging in the air. So the question is
      // whether the body occupies space — its own bounds, in the scene,
      // after posing — which is the thing the photograph is of.
      pending: [
        ...rig.pending,
        ...(bodyHeight(rig) > 0.5 ? [] : ["body missing"]),
      ],
    });
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
  centre: { x: number; y: number };
  span: number;
  onFramed: (key: string) => void;
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
    // Offset sideways with the target, so the camera orbits the thing
    // being looked at rather than the statue's midline.
    const target = new THREE.Vector3(centre.x, centre.y, 0);
    camera.position.set(
      target.x + Math.sin(bearing) * distance,
      target.y,
      Math.cos(bearing) * distance,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    // WHICH frame this is, not merely that one happened.
    //
    // A boolean was true from the first render — before the rig had been
    // measured — so a capture could be published against the fallback
    // camera while the real one was still a commit behind. Two sheets in
    // one run framed a hem where a head had been asked for. The key names
    // the frame, and the capture waits for the key it is about.
    onFramed(frameKey(bearing, centre, span));
    // The centre's COMPONENTS, not the object: the caller rebuilds it
    // every render and an identity dependency would re-aim the camera on
    // every commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, bearing, centre.x, centre.y, span, onFramed]);
  return null;
}

/** A frame, named by what it looks at — see Frame's onFramed. */
function frameKey(bearing: number, centre: { x: number; y: number }, span: number): string {
  return [bearing, centre.x, centre.y, span].map((value) => value.toFixed(5)).join("/");
}

/**
 * Hand the rendered frame to the capture script.
 *
 * INSIDE the canvas, deliberately. This lived in the page component,
 * read `document.querySelector("canvas")` and trusted a 500 ms timer to
 * mean the camera had moved — and it published pictures taken from the
 * previous frame's camera while reporting the current one, so a sheet
 * asked for a head returned a hem and the report said "head". Here there
 * is one timeline: the camera this component reads IS the camera the
 * buffer was drawn with, and it says where that camera stood, so a frame
 * and its picture can no longer disagree.
 */
function Publish({
  ready,
  frame,
  warnings,
}: {
  ready: boolean;
  frame: Record<string, unknown>;
  warnings: readonly string[];
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const key = JSON.stringify(frame);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    // A capture already published is withdrawn the moment the thing it
    // was a picture of changes, so a rebuild can never be read as the
    // render that preceded it.
    delete w.__devaformQa;
    if (!ready) return;
    // Let the framed camera render, then read the buffer: the canvas is
    // created with preserveDrawingBuffer so the last frame survives.
    const timer = setTimeout(() => {
      w.__devaformQaWarnings = warnings;
      // DRAW the frame that is about to be photographed.
      //
      // Reading whatever happened to be in the buffer meant trusting that
      // the render loop had run since the camera moved, and it had not:
      // every close-up in a sheet came back framed on the first,
      // unmeasured guess while the report named the frame that had been
      // asked for. A capture surface should not be a spectator of its own
      // render.
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      gl.render(scene, camera);
      w.__devaformQaFrame = { ...frame, camera: camera.position.toArray() };
      w.__devaformQa = gl.domElement.width ? gl.domElement.toDataURL("image/png") : "FAILED";
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, warnings, gl, scene, camera]);
  return null;
}

/**
 * The page reads its subject from the query string, which a prerender
 * cannot know, so the part that reads it is suspended: without this the
 * production build stops on /dev/qa rather than shipping the app.
 */
export default function QaCapturePage() {
  return (
    <Suspense fallback={null}>
      <QaCapture />
    </Suspense>
  );
}

function QaCapture() {
  const params = useSearchParams();
  const config = useMemo(() => configFor(new URLSearchParams(params.toString())), [params]);
  const view = VIEWS[params.get("view") ?? "front"] ?? 0;
  const focus = FOCUS[params.get("focus") ?? "full"] ?? FOCUS.full!;
  const [report, setReport] = useState<{
    warnings: string[];
    height: number;
    centre: { x: number; y: number };
    pending: string[];
  } | null>(null);
  const preset = getLightingPreset("studio");

  // The figure is a metre tall by construction, but a proportions slider
  // or a raised trishul can change what "the whole thing" means — so the
  // frame is computed from the built scene rather than assumed.
  const height = report?.height ?? 1;
  const centre = report?.centre ?? { x: 0, y: height * 0.5 };
  const span = height * focus.span;
  const bearing = (view * Math.PI) / 180;
  const [framed, setFramed] = useState<string | null>(null);
  const onFramed = useMemo(() => (key: string) => setFramed(key), []);
  const wanted = frameKey(bearing, centre, span);

  return (
    <div className="h-dvh w-dvw bg-[#14100d]">
      <Canvas
        shadows
        dpr={1}
        camera={CAMERA}
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
        <Publish
          ready={report !== null && report.pending.length === 0 && framed === wanted}
          frame={{ centre, span, height, view, framed: wanted }}
          warnings={report?.warnings ?? []}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
          <circleGeometry args={[2.4, 48]} />
          <meshStandardMaterial color="#1a1512" roughness={0.95} />
        </mesh>
      </Canvas>
    </div>
  );
}
