"use client";

/**
 * The 3D viewport: the presentation stage with the resolved character
 * standing on it.
 *
 * The stage — where the camera is, what light falls on the figure, what
 * room it stands in and how the customer first meets it — comes from a
 * PresentationConfig rather than from constants here. That is what keeps
 * the entry sequence, the backdrop and the hero composition one decision
 * instead of three, and what lets a future deity be given its own room by
 * adding a config rather than by branching a component.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getPresentation, type PresentationConfig } from "@devaform/asset-system";
import { CharacterRoot } from "@/engine/CharacterRoot";
import type { LightingPresetId } from "@/engine/lighting";
import { IntroSequence } from "@/presentation/IntroSequence";
import { StageBackdrop } from "@/presentation/StageBackdrop";
import { StageVignette } from "@/presentation/StageVignette";
import { StageLights } from "@/presentation/StageLights";
import { StageReadiness } from "@/presentation/StageReadiness";
import { stageViews } from "@/presentation/stageViews";
import { StageAlignment, StageSettle } from "@/presentation/StageSettle";
import { shouldPlayIntro, useStageStore } from "@/presentation/stageStore";
import { useDeity } from "@/state/deityContext";
import { useUiStore } from "@/state/uiStore";

function CameraCommands({
  stage,
  controlsRef,
}: {
  stage: PresentationConfig;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const command = useUiStore((s) => s.cameraCommand);
  const camera = useThree((s) => s.camera);
  const phase = useStageStore((s) => s.phase);

  useEffect(() => {
    // The sequence owns the camera until it has settled; a view command
    // arriving mid-intro would fight it.
    if (phase !== "ready") return;
    const view = stageViews(stage)[command.view];
    camera.position.set(...view.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...view.target);
      controls.update();
    } else {
      camera.lookAt(...view.target);
    }
  }, [command, camera, controlsRef, stage, phase]);

  return null;
}

export function EditorViewport() {
  const deity = useDeity();
  const stage = getPresentation(deity?.id);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lightingPreset = useUiStore((s) => s.lightingPreset);
  const phase = useStageStore((s) => s.phase);
  const finishSettle = useStageStore((s) => s.finishSettle);

  /**
   * Whether this visit gets the sequence — decided once, on the client.
   *
   * `null` until it is decided, and the video does not mount until then.
   * Not a nicety: the element starts fetching five megabytes the moment
   * it exists, and a customer on their second visit of the session has
   * already seen the temple and should not pay for it again.
   */
  const [introAllowed, setIntroAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    const allowed = Boolean(stage.intro) && shouldPlayIntro();
    setIntroAllowed(allowed);
    // Nothing to hand over from: settle immediately and give them the
    // stage, which still comes up out of the dark, just quickly.
    if (!allowed) finishSettle();
  }, [stage.intro, finishSettle]);

  const hasBackdrop = Boolean(stage.backdrop.image);

  return (
    <div className="relative h-full w-full">
      {hasBackdrop && <StageBackdrop config={stage.backdrop} />}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: stage.camera.position as unknown as [number, number, number], fov: stage.camera.fov, near: 0.05, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: hasBackdrop }}
        className="absolute inset-0 h-full w-full"
        style={{ background: "transparent" }}
      >
        <StageLights
          presetId={lightingPreset as LightingPresetId}
          settleMs={stage.intro?.settleMs ?? 900}
          transparent={hasBackdrop}
        />
        <StageSettle
          camera={stage.camera}
          settleMs={stage.intro?.settleMs ?? 900}
          controlsRef={controlsRef}
        />
        <StageAlignment camera={stage.camera} recedeWithin={stage.backdrop.recedeWithin} />
        <StageReadiness />
        <CameraCommands stage={stage} controlsRef={controlsRef} />
        <CharacterRoot />
        <ContactShadows position={[0, -0.002, 0]} opacity={0.62} scale={3.2} blur={2.4} far={1.6} />
        {/* A ground disc only when there is no room behind the figure.
            With a backdrop there IS a floor — the one in the frame — and
            a second one drawn over it is a brown ellipse lying on a
            temple pavement. The contact shadow stays either way: it is
            what marries the figure to whichever floor it is standing on. */}
        {!hasBackdrop && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
            <circleGeometry args={[2.4, 48]} />
            <meshStandardMaterial color="#160f0a" roughness={0.96} />
          </mesh>
        )}
        <OrbitControls
          ref={controlsRef}
          target={stage.camera.target as unknown as [number, number, number]}
          enabled={phase === "ready"}
          enablePan
          minDistance={stage.camera.minDistance}
          maxDistance={stage.camera.maxDistance}
          maxPolarAngle={stage.camera.maxPolarAngle}
          makeDefault
        />
      </Canvas>
      {stage.intro && introAllowed && phase !== "ready" && (
        <IntroSequence intro={stage.intro} grade={stage.backdrop.grade} />
      )}
      {hasBackdrop && <StageVignette />}
    </div>
  );
}
