"use client";

/**
 * The stage's light, and the ramp that reveals the statue with it.
 *
 * One rig, one place. The preset says what the finished lighting is; the
 * ramp says how much of it is on. During the entry sequence it is off —
 * the statue stands in the lit hall as a shape in the dark — and over the
 * settle it comes up to full. Nothing about the character is touched,
 * which is the whole reason the reveal is done with light: a presentation
 * layer that reaches into materials to fade them is a presentation layer
 * that owns the character.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { SceneEnvironment } from "@/engine/SceneEnvironment";
import { getLightingPreset, type LightingPresetId } from "@/engine/lighting";
import { useStageStore } from "./stageStore";

export function StageLights({
  presetId,
  settleMs,
  /** Whether a backdrop image is behind the canvas: it owns the background. */
  transparent,
}: {
  presetId: LightingPresetId;
  settleMs: number;
  transparent: boolean;
}) {
  const preset = getLightingPreset(presetId);
  const phase = useStageStore((state) => state.phase);
  const group = useRef<THREE.Group | null>(null);
  const level = useRef(phase === "ready" ? 1 : 0);
  const scene = useThree((state) => state.scene);

  useFrame((_, delta) => {
    const wanted = phase === "intro" ? 0 : 1;
    if (level.current !== wanted) {
      const step = (delta * 1000) / Math.max(1, settleMs);
      level.current =
        wanted > level.current
          ? Math.min(1, level.current + step)
          : Math.max(0, level.current - step * 4);
    }
    const lit = level.current;
    scene.environmentIntensity = preset.envIntensity * lit;
    const node = group.current;
    if (!node) return;
    node.children.forEach((child: THREE.Object3D) => {
      const light = child as THREE.Light & { userData: { full?: number } };
      if (light.userData.full === undefined) return;
      light.intensity = light.userData.full * lit;
    });
  });

  return (
    <>
      {!transparent && <color attach="background" args={[preset.background]} />}
      <SceneEnvironment intensity={preset.envIntensity} />
      <group ref={group}>
        <hemisphereLight
          color={preset.hemisphere.sky}
          groundColor={preset.hemisphere.ground}
          intensity={preset.hemisphere.intensity}
          userData={{ full: preset.hemisphere.intensity }}
        />
        {preset.directionals.map((light, index) => (
          <directionalLight
            key={`${preset.id}-${index}`}
            position={light.position}
            intensity={light.intensity}
            color={light.color}
            userData={{ full: light.intensity }}
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
      </group>
    </>
  );
}
