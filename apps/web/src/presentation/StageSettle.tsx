"use client";

/**
 * The last beat of the entry sequence, inside the scene.
 *
 * When the video hands over, the room is already there — it is the video's
 * own final frame, behind the canvas — and the statue is standing in it
 * unlit. This raises the light on it over a second and a half while the
 * camera eases its last few centimetres into the hero composition, and
 * then stops. The frame it stops on is not a copy of the stage's first
 * frame; it IS the stage's first frame, because nothing hands over again.
 *
 * The statue is revealed by LIGHT rather than by opacity, which is both
 * how a statue in a dark hall is actually revealed and the only way to do
 * it without reaching into the character's materials. The presentation
 * layer consumes the resolved character; it does not modify it.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { StageCamera } from "@devaform/asset-system";
import { useStageStore } from "./stageStore";

/** Smooth at both ends, and slower at the end than at the start. */
const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

export function StageSettle({
  camera: hero,
  settleMs,
  controlsRef,
}: {
  camera: StageCamera;
  settleMs: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const phase = useStageStore((state) => state.phase);
  const finishSettle = useStageStore((state) => state.finishSettle);
  const camera = useThree((state) => state.camera);
  const started = useRef<number | null>(null);

  // Where the sequence's camera comes FROM: a touch further out, a touch
  // round, a touch higher. Small on purpose — a long move at the end of an
  // intro reads as a second animation rather than as the end of the first.
  const from = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3(...hero.position));
  useEffect(() => {
    const target = new THREE.Vector3(...hero.target);
    to.current.set(...hero.position);
    const radius = to.current.clone().sub(target);
    const spun = radius
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), hero.settleFrom.azimuth)
      .multiplyScalar(1 + hero.settleFrom.dolly);
    from.current.copy(target).add(spun).setY(to.current.y + hero.settleFrom.height);
    if (phase !== "ready") camera.position.copy(from.current);
    // Only when the hero composition itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero]);

  useFrame((_, delta) => {
    if (phase !== "settling") return;
    started.current = (started.current ?? 0) + delta * 1000;
    const t = Math.min(1, started.current / settleMs);
    camera.position.lerpVectors(from.current, to.current, ease(t));
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...hero.target);
      controls.update();
    } else {
      camera.lookAt(...hero.target);
    }
    if (t >= 1) finishSettle();
  });

  return null;
}
