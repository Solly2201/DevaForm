"use client";

/**
 * Whether there is a statue standing on the stage yet.
 *
 * Read off the live rig handle rather than pushed from the engine: the
 * presentation layer consumes the resolved character, and a character
 * system that has to know a presentation layer exists is a character
 * system with a presentation layer inside it.
 *
 * "Ready" is the honest question a photograph can fail — the body's mesh
 * is in the scene and nothing is still on its way — because the frame the
 * sequence hands over to has to have the figure in it.
 */
import { useFrame } from "@react-three/fiber";
import { activeRig } from "@/engine/rigHandle";
import { useStageStore } from "./stageStore";

export function StageReadiness() {
  const setCharacterReady = useStageStore((state) => state.setCharacterReady);

  useFrame(() => {
    const rig = activeRig.current;
    setCharacterReady(
      rig !== null && rig.pending.length === 0 && rig.bodyMeshes.length > 0,
    );
  });

  return null;
}
