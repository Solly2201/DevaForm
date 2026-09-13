"use client";

/**
 * CharacterRoot — bridges the CharacterConfiguration to the THREE scene.
 *
 * Lifecycle split for performance:
 * - structure (parts/attachments/base/proportions/morphs/hands/arms):
 *   rebuild rig via memo
 * - pose: applied in place on joints (no rebuild)
 * - materials: mutated in place on shared zone materials (no rebuild)
 *
 * GLB assets load asynchronously; a cache subscription bumps a counter so
 * the rig rebuilds once the mesh arrives.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAssetRef } from "@devaform/asset-system";
import { useEditorStore } from "@/state/editorStore";
import { subscribeGlbCache } from "./glbCache";
import { ZoneMaterials } from "./materials";
import { applyPose } from "./pose";
import { alignUprightAttachments, buildRig, disposeRig, type CharacterRig } from "./rig";
import { applyMorphInfluences } from "./skinning";
import { activeRig } from "./rigHandle";

export function CharacterRoot() {
  const parts = useEditorStore((s) => s.config.parts);
  const attachments = useEditorStore((s) => s.config.attachments);
  const base = useEditorStore((s) => s.config.base);
  const proportions = useEditorStore((s) => s.config.proportions);
  const morphs = useEditorStore((s) => s.config.morphs);
  const hands = useEditorStore((s) => s.config.hands);
  const arms = useEditorStore((s) => s.config.arms);
  const pose = useEditorStore((s) => s.config.pose);
  const posePreset = useEditorStore((s) => s.config.pose.preset);
  const materials = useEditorStore((s) => s.config.materials);

  const [glbVersion, setGlbVersion] = useState(0);
  useEffect(() => subscribeGlbCache(() => setGlbVersion((v) => v + 1)), []);

  const zoneMaterialsRef = useRef<ZoneMaterials | null>(null);
  if (zoneMaterialsRef.current === null) {
    zoneMaterialsRef.current = new ZoneMaterials();
  }
  const zoneMaterials = zoneMaterialsRef.current;

  // Morph weights reach mesh assets as GPU morph-target influences, which
  // never need a rebuild. Procedural generators instead consume the same
  // weights parametrically, so a rebuild is still required while a chosen
  // procedural asset declares morph targets — decided from asset metadata,
  // never from asset ids.
  const proceduralMorphKey = useMemo(() => {
    const rebuilds = [...Object.values(parts), ...attachments.map((a) => a.asset)].some((ref) => {
      const asset = resolveAssetRef(ref);
      return asset?.source.kind === "procedural" && (asset.morphTargets?.length ?? 0) > 0;
    });
    return rebuilds ? JSON.stringify(morphs) : "";
  }, [parts, attachments, morphs]);

  // Rebuild rig only when structure changes. The pose preset participates
  // because seated presets swap clothing to pose-compatible geometry.
  const rig: CharacterRig = useMemo(() => {
    const config = useEditorStore.getState().config;
    return buildRig(config, zoneMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, attachments, base, proportions, proceduralMorphKey, hands, arms, posePreset, glbVersion, zoneMaterials]);

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

  // Pose: in-place joint rotation updates, then re-verticalize held shafts.
  useEffect(() => {
    applyPose(rig.joints, pose);
    alignUprightAttachments(rig);
  }, [rig, pose]);

  // Morphs: in-place GPU influence updates (no geometry rebuild).
  useEffect(() => {
    applyMorphInfluences(rig.root, morphs);
  }, [rig, morphs]);

  // Materials: in-place color/finish updates.
  useEffect(() => {
    zoneMaterials.applyConfiguration(materials);
  }, [zoneMaterials, materials]);

  useEffect(() => {
    if (rig.warnings.length > 0) {
      console.warn("Character rig warnings:", rig.warnings);
    }
    activeRig.current = rig;
    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for QA automation (scene-graph inspection scripts).
      (window as unknown as { __devaformRig?: CharacterRig }).__devaformRig = rig;
    }
    return () => {
      if (activeRig.current === rig) activeRig.current = null;
    };
  }, [rig]);

  return <primitive object={rig.root} />;
}
