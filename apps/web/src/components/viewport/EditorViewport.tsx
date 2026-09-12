"use client";

/**
 * The 3D viewport: R3F canvas, lighting rig, ground, camera controls and
 * the character itself. Camera view commands arrive via the UI store.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CharacterRoot } from "@/engine/CharacterRoot";
import { SceneEnvironment } from "@/engine/SceneEnvironment";
import { getLightingPreset } from "@/engine/lighting";
import { useUiStore, type CameraView } from "@/state/uiStore";

const DEFAULT_TARGET = new THREE.Vector3(0, 0.62, 0);
const FACE_TARGET = new THREE.Vector3(0, 1.1, 0.05);

const VIEWS: Record<CameraView, { position: [number, number, number]; target: THREE.Vector3 }> = {
  front: { position: [0, 0.78, 2.4], target: DEFAULT_TARGET },
  back: { position: [0, 0.78, -2.4], target: DEFAULT_TARGET },
  left: { position: [2.4, 0.78, 0], target: DEFAULT_TARGET },
  right: { position: [-2.4, 0.78, 0], target: DEFAULT_TARGET },
  threeQuarter: { position: [1.55, 1.0, 1.85], target: DEFAULT_TARGET },
  face: { position: [0.28, 1.16, 0.85], target: FACE_TARGET },
  reset: { position: [1.55, 1.0, 1.85], target: DEFAULT_TARGET },
};

function CameraCommands({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const command = useUiStore((s) => s.cameraCommand);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const view = VIEWS[command.view];
    camera.position.set(...view.position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(view.target);
      controls.update();
    } else {
      camera.lookAt(view.target);
    }
  }, [command, camera, controlsRef]);

  return null;
}

function Lights() {
  const presetId = useUiStore((s) => s.lightingPreset);
  const preset = getLightingPreset(presetId);
  return (
    <>
      <color attach="background" args={[preset.background]} />
      <SceneEnvironment intensity={preset.envIntensity} />
      <hemisphereLight
        color={preset.hemisphere.sky}
        groundColor={preset.hemisphere.ground}
        intensity={preset.hemisphere.intensity}
      />
      {preset.directionals.map((light, index) => (
        <directionalLight
          key={`${preset.id}-${index}`}
          position={light.position}
          intensity={light.intensity}
          color={light.color}
          castShadow={light.castShadow ?? false}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={10}
          shadow-camera-left={-1.5}
          shadow-camera-right={1.5}
          shadow-camera-top={2}
          shadow-camera-bottom={-1}
        />
      ))}
    </>
  );
}

export function EditorViewport() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: VIEWS.threeQuarter.position, fov: 38, near: 0.05, far: 50 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      className="h-full w-full"
    >
      <Lights />
      <CameraCommands controlsRef={controlsRef} />
      <CharacterRoot />
      <ContactShadows position={[0, -0.002, 0]} opacity={0.6} scale={3.2} blur={2.4} far={1.6} />
      {/* Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
        <circleGeometry args={[2.4, 48]} />
        <meshStandardMaterial color="#1a1512" roughness={0.95} />
      </mesh>
      <OrbitControls
        ref={controlsRef}
        target={DEFAULT_TARGET.toArray()}
        enablePan
        minDistance={0.5}
        maxDistance={6}
        maxPolarAngle={Math.PI * 0.55}
        makeDefault
      />
    </Canvas>
  );
}
