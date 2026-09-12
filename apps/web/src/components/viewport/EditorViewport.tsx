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
import { getLightingPreset } from "@/engine/lighting";
import { useUiStore, type CameraView } from "@/state/uiStore";

const TARGET = new THREE.Vector3(0, 0.55, 0);

const VIEW_POSITIONS: Record<CameraView, [number, number, number]> = {
  front: [0, 0.7, 2.4],
  back: [0, 0.7, -2.4],
  left: [2.4, 0.7, 0],
  right: [-2.4, 0.7, 0],
  threeQuarter: [1.6, 0.95, 1.9],
  reset: [1.6, 0.95, 1.9],
};

function CameraCommands({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const command = useUiStore((s) => s.cameraCommand);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const position = VIEW_POSITIONS[command.view];
    camera.position.set(...position);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(TARGET);
      controls.update();
    } else {
      camera.lookAt(TARGET);
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
      camera={{ position: VIEW_POSITIONS.threeQuarter, fov: 38, near: 0.05, far: 50 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      className="h-full w-full"
    >
      <Lights />
      <CameraCommands controlsRef={controlsRef} />
      <CharacterRoot />
      <ContactShadows position={[0, -0.061, 0]} opacity={0.55} scale={3} blur={2.2} far={1.4} />
      {/* Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.065, 0]} receiveShadow>
        <circleGeometry args={[2.2, 48]} />
        <meshStandardMaterial color="#1b1713" roughness={0.95} />
      </mesh>
      <OrbitControls
        ref={controlsRef}
        target={TARGET.toArray()}
        enablePan
        minDistance={0.5}
        maxDistance={6}
        maxPolarAngle={Math.PI * 0.55}
        makeDefault
      />
    </Canvas>
  );
}
