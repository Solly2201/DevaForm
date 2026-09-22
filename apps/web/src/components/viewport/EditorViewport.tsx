"use client";

/**
 * The 3D viewport: the live statue, on a transparent canvas over the
 * stage's fullscreen backdrop.
 *
 * The stage — where the camera is, what light falls on the figure, what
 * room stands behind it — comes from a PresentationConfig rather than
 * from constants here. That is what keeps the entry sequence, the
 * backdrop and the hero composition one decision instead of three, and
 * what lets a future deity be given its own room by adding a config
 * rather than by branching a component. The fullscreen layers themselves
 * — backdrop, vignette, entry — are hosted by the shell; this is
 * only the statue.
 *
 * The viewport's one presentation duty of its own is measurement: the
 * stage frame is centred on the STATUE, and only this component knows
 * where the statue's screen position is — its own container's centre. It
 * measures that and publishes it (see stageFrame.ts); the fullscreen
 * layers above and below follow.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PresentationConfig } from "@devaform/asset-system";
import { CharacterRoot } from "@/engine/CharacterRoot";
import type { LightingPresetId } from "@/engine/lighting";
import { heroComposition, type HeroComposition } from "@/presentation/heroFraming";
import { StageEnvironment } from "@/presentation/StageEnvironment";
import { StageLights } from "@/presentation/StageLights";
import { StageReadiness } from "@/presentation/StageReadiness";
import { StageSettle } from "@/presentation/StageSettle";
import { stageViews } from "@/presentation/stageViews";
import { isMeasured } from "@/engine/figureExtent";
import { useStageStore } from "@/presentation/stageStore";
import { useUiStore } from "@/state/uiStore";

/** The camera sees every layer; the lights do not. */
function SeeEveryLayer() {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.layers.enableAll();
  }, [camera]);
  return null;
}

function CameraCommands({
  stage,
  controlsRef,
  onMove,
}: {
  stage: PresentationConfig;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onMove: () => void;
}) {
  const command = useUiStore((s) => s.cameraCommand);
  const camera = useThree((s) => s.camera);
  const phase = useStageStore((s) => s.phase);
  const figure = useStageStore((s) => s.figure);
  const size = useThree((s) => s.size);

  useEffect(() => {
    // The sequence owns the camera until it has settled; a view command
    // arriving mid-intro would fight it.
    if (phase !== "ready") return;
    // And nonce 0 is the store's initial value rather than a command
    // anybody issued. Acting on it the moment the stage became ready
    // raced the figure's measurement: the camera landed on the authored
    // coordinates, counted itself as the customer's own framing, and the
    // composed hero never arrived — so the statue sat at a target the
    // camera was not standing back for. AdoptHero owns the opening
    // frame; this owns the buttons.
    if (command.nonce === 0) return;
    const view = stageViews(stage, { figure, aspect: size.width / size.height })[command.view];
    camera.position.set(...view.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...view.target);
      controls.update();
    } else {
      camera.lookAt(...view.target);
    }
    onMove();
    // A view command is a camera move the customer asked for. Re-running
    // it because the window was resized, or because a crown finished
    // loading, is not — so only the command itself is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, camera, controlsRef, stage, phase]);

  return null;
}

/**
 * Stand the camera in the composed hero shot.
 *
 * Only while the composition is still the stage's to make: the moment the
 * customer takes hold of the camera it is theirs, and a figure measured a
 * beat later — a crown that finished loading, a preset that sat the
 * statue down — must not pull the view out of their hands. Before that it
 * matters a great deal, because the stage's authored coordinates frame
 * nobody in particular and the measured ones frame whoever is there.
 */
function AdoptHero({
  hero,
  controlsRef,
  touched,
}: {
  hero: HeroComposition;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  touched: React.RefObject<boolean>;
}) {
  const camera = useThree((s) => s.camera);
  const phase = useStageStore((s) => s.phase);

  useEffect(() => {
    // `settling` is the entry easing onto this same composition — see
    // StageSettle. Two things moving one camera is one thing too many.
    if (touched.current || phase === "settling") return;
    camera.position.set(...hero.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...hero.target);
      controls.update();
    } else {
      camera.lookAt(...hero.target);
    }
  }, [hero, phase, camera, controlsRef, touched]);

  return null;
}

export function EditorViewport({ stage }: { stage: PresentationConfig }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lightingPreset = useUiStore((s) => s.lightingPreset);
  const phase = useStageStore((s) => s.phase);
  const figure = useStageStore((s) => s.figure);

  /**
   * The picture this stage is composing, of the figure actually on it.
   *
   * The aspect ratio belongs in it because a tall narrow window frames a
   * standing figure quite differently from a wide one: which dimension
   * binds changes, and with it how far back the camera has to stand.
   */
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box && box.height > 0) setAspect(box.width / box.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hero = useMemo(
    () => heroComposition(stage.camera, figure, aspect),
    [stage.camera, figure, aspect],
  );

  /**
   * A BUILT room, or a plain ground.
   *
   * The screen-space backdrop is gone from the Studio: a photograph is
   * correct for one camera position and the customer moves. A stage that
   * declares an environment gets it as geometry, anchored to the stage's
   * own pivot; one that does not gets the dark disc it always had.
   */
  const environment = stage.environment;

  /**
   * How far the framing may travel from the stage's own composition.
   *
   * A statue on a photographed floor cannot be walked away from: the room
   * does not parallax, so a target that wanders leaves the figure beside
   * its pedestal rather than on it. These are the bounds inside which the
   * framing is the customer's — about a hand's breadth sideways and
   * forward, and most of the figure's height vertically, which is what
   * "bring the face into frame" needs.
   */
  const keepFramingOnStage = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const [tx, ty, tz] = hero.target;
    // Measured off the figure rather than fixed, for the same reason the
    // distance is: "most of the figure's height" is a different number of
    // metres for a short broad Ganesha and a tall Vishnu, and a constant
    // that lets one of them bring its face into frame will not let the
    // other. The floors are what a stage with nobody measured on it gets.
    const LATERAL = isMeasured(figure) ? Math.max(0.3, figure.radius) : 0.34;
    const VERTICAL = isMeasured(figure)
      ? Math.max(0.45, (figure.topY - figure.footY) * 0.5)
      : 0.55;
    const clamp = (value: number, centre: number, span: number) =>
      Math.min(centre + span, Math.max(centre - span, value));
    const x = clamp(controls.target.x, tx, LATERAL);
    const y = clamp(controls.target.y, ty, VERTICAL);
    const z = clamp(controls.target.z, tz, LATERAL);
    if (x !== controls.target.x || y !== controls.target.y || z !== controls.target.z) {
      // Move the CAMERA with the clamp, or the orbit distance changes
      // under the customer's hand as they push against the bound.
      controls.object.position.add(
        new THREE.Vector3(x - controls.target.x, y - controls.target.y, z - controls.target.z),
      );
      controls.target.set(x, y, z);
    }
  }, [hero.target, figure]);

  /**
   * Whether the customer has taken the camera anywhere yet.
   *
   * Set when a drag, a pinch or a wheel BEGINS, not on every change the
   * controls report. The settle, the view buttons and the framing clamp
   * all move the camera without anyone touching it; counting those as
   * "moved" hid the navigation hint before it could be read, and would
   * let the stage mistake its own composition for the customer's.
   */
  const touched = useRef(false);
  const [moved, setMoved] = useState(false);
  const takeCamera = useCallback(() => {
    touched.current = true;
    setMoved(true);
  }, []);

  const cameraProps = useMemo(
    () => ({
      position: stage.camera.position as unknown as [number, number, number],
      fov: stage.camera.fov,
      near: 0.05,
      far: 50,
    }),
    [stage.camera],
  );

  /**
   * Dev-only handle, beside the stores'. "Pan is enabled" and "the view
   * moved" are different claims, and only the second one is the product
   * working — scripts/qa-camera.mjs drags a real mouse and reads this.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __devaformStage?: unknown }).__devaformStage = () => ({
      position: hero.position,
      target: hero.target,
      authored: { position: stage.camera.position, target: stage.camera.target },
      figure,
    });
    // Put the camera somewhere, for a scripted orbit — the QA sweep has
    // to drive the real controls rather than a camera of its own.
    (window as unknown as { __devaformSetCamera?: unknown }).__devaformSetCamera = (
      position: [number, number, number],
    ) => {
      const controls = controlsRef.current;
      if (!controls) return;
      controls.object.position.set(...position);
      controls.update();
    };
    (window as unknown as { __devaformCamera?: unknown }).__devaformCamera = () => {
      const controls = controlsRef.current;
      if (!controls) return null;
      const object = controls.object as THREE.PerspectiveCamera;
      return {
        position: object.position.toArray().map((n) => Number(n.toFixed(4))),
        target: controls.target.toArray().map((n) => Number(n.toFixed(4))),
        distance: Number(object.position.distanceTo(controls.target).toFixed(4)),
      };
    };
  }, [stage.camera, hero, figure]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/*
        How to move the camera, said once.

        Right-drag is where every 3D tool puts pan and almost nobody
        discovers it on their own — least of all in a browser, where
        right-drag usually means a context menu. The line is quiet, it is
        outside the composition, and it goes as soon as the customer has
        moved the camera at all.
      */}
      {phase === "ready" && (
        <p
          aria-hidden
          // Top-left, where nothing else lives: at the bottom it wrapped
          // onto two lines and ran into the camera rail on a narrow window.
          className="pointer-events-none absolute left-4 top-4 z-10 whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-stone-500"
          style={{ opacity: moved ? 0 : 0.85, transition: "opacity 600ms ease-out" }}
        >
          Drag to turn · Right-drag to move · Scroll to zoom
        </p>
      )}
      <Canvas
        shadows
        dpr={[1, 2]}
        /**
         * ONE camera.
         *
         * An inline literal here is a new object every render, and
         * react-three-fiber reconciles a fresh camera when it changes —
         * so the component that moves the camera and the controls that
         * orbit it end up holding different ones. "Reset" put the view
         * back on a camera nobody was rendering with, which is why it
         * landed near the hero composition rather than on it. The same
         * defect cost three misread QA sheets on /dev/qa.
         */
        camera={cameraProps}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="absolute inset-0 h-full w-full"
        style={{ background: "transparent" }}
      >
        <StageLights
          presetId={lightingPreset as LightingPresetId}
          settleMs={stage.intro?.settleMs ?? 900}
          transparent={false}
        />
        <StageSettle
          camera={stage.camera}
          hero={hero}
          settleMs={stage.intro?.settleMs ?? 900}
          controlsRef={controlsRef}
        />
        <StageReadiness />
        <SeeEveryLayer />
        <AdoptHero hero={hero} controlsRef={controlsRef} touched={touched} />
        <CameraCommands stage={stage} controlsRef={controlsRef} onMove={takeCamera} />
        {environment && <StageEnvironment config={environment} pivot={stage.pivot} />}
        <CharacterRoot />
        <ContactShadows position={[0, -0.002, 0]} opacity={0.62} scale={3.2} blur={2.4} far={1.6} />
        {/* A ground disc only when there is no room behind the figure.
            With a backdrop there IS a floor — the one in the frame — and
            a second one drawn over it is a brown ellipse lying on a
            temple pavement. The contact shadow stays either way: it is
            what marries the figure to whichever floor it stands on. */}
        {!environment && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
            <circleGeometry args={[2.4, 48]} />
            <meshStandardMaterial color="#160f0a" roughness={0.96} />
          </mesh>
        )}
        <OrbitControls
          ref={controlsRef}
          target={hero.target}
          enabled={phase === "ready"}
          /**
           * ORBIT, PAN AND DOLLY — all three.
           *
           * Panning was switched off wherever there was a backdrop, on
           * the reasoning that the statue stands on a painted mandala and
           * sliding it off its own pedestal looks wrong. That is true,
           * and it is not worth what it cost: a customer who has zoomed
           * in on a crown had no way to bring the face into frame, and
           * right-drag — which is where every 3D tool puts pan — did
           * nothing at all.
           *
           * So pan is on, and BOUNDED instead (see keepFramingOnStage):
           * the target may move far enough to re-frame the figure and no
           * further, which keeps the feet near the mandala while giving
           * back the third axis of navigation. Screen-space panning,
           * because dragging a statue should move it the way the hand
           * moved.
           */
          enablePan
          screenSpacePanning
          panSpeed={0.8}
          /**
           * No inertia. drei turns damping on by default, and a damped
           * pan keeps translating the rig for a second after the hand
           * lets go — which meant "Reset" set the hero composition and
           * then drifted off it, further on each press. It also coasts
           * into the framing bounds and has to be clamped every frame.
           * A configurator wants the view to go where it is put.
           */
          enableDamping={false}
          minDistance={stage.camera.minDistance}
          maxDistance={stage.camera.maxDistance}
          minPolarAngle={stage.camera.minPolarAngle}
          maxPolarAngle={stage.camera.maxPolarAngle}
          onChange={keepFramingOnStage}
          onStart={takeCamera}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
