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
import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PresentationConfig } from "@devaform/asset-system";
import { CharacterRoot } from "@/engine/CharacterRoot";
import type { LightingPresetId } from "@/engine/lighting";
import { clearStageFrame, measureStageFrame } from "@/presentation/stageFrame";
import { StageLights } from "@/presentation/StageLights";
import { StageReadiness } from "@/presentation/StageReadiness";
import { StageSettle } from "@/presentation/StageSettle";
import { stageViews } from "@/presentation/stageViews";
import { useStageStore } from "@/presentation/stageStore";
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

export function EditorViewport({ stage }: { stage: PresentationConfig }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lightingPreset = useUiStore((s) => s.lightingPreset);
  const phase = useStageStore((s) => s.phase);

  const hasBackdrop = Boolean(stage.backdrop.image);

  // Publish where the statue stands on screen, so the fullscreen frame —
  // entry and backdrop alike — centres its mandala there.
  useEffect(() => {
    if (!hasBackdrop) return;
    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      measureStageFrame(
        stage.backdrop,
        { width: window.innerWidth, height: window.innerHeight },
        centerX,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      clearStageFrame();
    };
  }, [stage, hasBackdrop]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: stage.camera.position as unknown as [number, number, number],
          fov: stage.camera.fov,
          near: 0.05,
          far: 50,
        }}
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
        <StageReadiness />
        <CameraCommands stage={stage} controlsRef={controlsRef} />
        <CharacterRoot />
        <ContactShadows position={[0, -0.002, 0]} opacity={0.62} scale={3.2} blur={2.4} far={1.6} />
        {/* A ground disc only when there is no room behind the figure.
            With a backdrop there IS a floor — the one in the frame — and
            a second one drawn over it is a brown ellipse lying on a
            temple pavement. The contact shadow stays either way: it is
            what marries the figure to whichever floor it stands on. */}
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
          // On a staged backdrop the statue stands where the mandala is;
          // panning would slide it off its own pedestal. Free viewing is
          // orbit and dolly, which is what inspecting a statue is.
          enablePan={!hasBackdrop}
          minDistance={stage.camera.minDistance}
          maxDistance={stage.camera.maxDistance}
          minPolarAngle={stage.camera.minPolarAngle}
          maxPolarAngle={stage.camera.maxPolarAngle}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
