"use client";

/**
 * Whether there is a statue standing on the stage yet, and how big it is.
 *
 * Read off the live rig handle rather than pushed from the engine: the
 * presentation layer consumes the resolved character, and a character
 * system that has to know a presentation layer exists is a character
 * system with a presentation layer inside it.
 *
 * "Ready" is the honest question a photograph can fail — the body's mesh
 * is in the scene and nothing is still on its way — because the frame the
 * sequence hands over to has to have the figure in it.
 *
 * The SIZE is asked at the same moment and for the same reason: the stage
 * composes its hero shot from the figure's own metres (see
 * heroFraming.ts), and the first moment those metres are true is the
 * moment the figure is complete. Measured once per rig, not per frame —
 * it walks the body's vertices — and again whenever the rig is rebuilt,
 * which is exactly when the statue's extent can have changed. A joint the
 * customer bends does not rebuild the rig, so the camera does not chase
 * a knee.
 */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { measureFigure } from "@/engine/figureExtent";
import { activeRig } from "@/engine/rigHandle";
import type { CharacterRig } from "@/engine/rig";
import { useStageStore } from "./stageStore";

export function StageReadiness() {
  const setCharacterReady = useStageStore((state) => state.setCharacterReady);
  const setFigure = useStageStore((state) => state.setFigure);
  const measured = useRef<CharacterRig | null>(null);

  useFrame(() => {
    const rig = activeRig.current;
    const ready = rig !== null && rig.pending.length === 0 && rig.bodyMeshes.length > 0;
    setCharacterReady(ready);

    if (!ready || rig === null) {
      if (rig === null) measured.current = null;
      return;
    }
    if (measured.current === rig) return;
    measured.current = rig;
    setFigure(measureFigure(rig));
  });

  return null;
}
