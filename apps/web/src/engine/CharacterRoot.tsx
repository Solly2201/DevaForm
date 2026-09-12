"use client";

/**
 * CharacterRoot — bridges the CharacterConfiguration to the THREE scene.
 *
 * Lifecycle split for performance:
 * - structure (parts/attachments/base/proportions): rebuild rig via memo
 * - pose: applied in place on joints (no rebuild)
 * - materials: mutated in place on shared zone materials (no rebuild)
 */
import { useEffect, useMemo, useRef } from "react";
import { useEditorStore } from "@/state/editorStore";
import { ZoneMaterials } from "./materials";
import { applyPose } from "./pose";
import { buildRig, disposeRig, type CharacterRig } from "./rig";

export function CharacterRoot() {
  const parts = useEditorStore((s) => s.config.parts);
  const attachments = useEditorStore((s) => s.config.attachments);
  const base = useEditorStore((s) => s.config.base);
  const proportions = useEditorStore((s) => s.config.proportions);
  const pose = useEditorStore((s) => s.config.pose);
  const materials = useEditorStore((s) => s.config.materials);

  const zoneMaterialsRef = useRef<ZoneMaterials | null>(null);
  if (zoneMaterialsRef.current === null) {
    zoneMaterialsRef.current = new ZoneMaterials();
  }
  const zoneMaterials = zoneMaterialsRef.current;

  // Rebuild rig only when structure changes.
  const rig: CharacterRig = useMemo(() => {
    const config = useEditorStore.getState().config;
    return buildRig(config, zoneMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, attachments, base, proportions, zoneMaterials]);

  // Dispose the previous rig's geometry when a new one replaces it.
  const previousRig = useRef<CharacterRig | null>(null);
  useEffect(() => {
    if (previousRig.current && previousRig.current !== rig) {
      disposeRig(previousRig.current);
    }
    previousRig.current = rig;
  }, [rig]);

  // Dispose everything on unmount.
  useEffect(() => {
    return () => {
      if (previousRig.current) disposeRig(previousRig.current);
      zoneMaterials.dispose();
      zoneMaterialsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pose: in-place joint rotation updates.
  useEffect(() => {
    applyPose(rig.joints, pose);
  }, [rig, pose]);

  // Materials: in-place color/finish updates.
  useEffect(() => {
    zoneMaterials.applyConfiguration(materials);
  }, [zoneMaterials, materials]);

  useEffect(() => {
    if (rig.warnings.length > 0) {
      console.warn("Character rig warnings:", rig.warnings);
    }
  }, [rig]);

  return <primitive object={rig.root} />;
}
