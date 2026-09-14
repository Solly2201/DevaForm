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
import { applyGestureOrientations, applyGripOrientations, applyPose } from "./pose";
import { alignUprightAttachments, buildRig, disposeRig, type CharacterRig } from "./rig";
import { applyMorphInfluences } from "./skinning";
import { morphInfluences } from "./morphs";
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
  // never need a rebuild. Two cases still do, both read from asset
  // metadata rather than asset ids:
  //   1. a procedural asset that consumes the weights parametrically;
  //   2. a mesh body whose morphs move its measured surfaces, while some
  //      procedural item is being fitted to those surfaces — the fit is
  //      baked at build time, so it has to be rebuilt to stay on the skin.
  const proceduralMorphKey = useMemo(() => {
    const refs = [...Object.values(parts), ...attachments.map((a) => a.asset)];
    const assets = refs.map((ref) => resolveAssetRef(ref));
    const parametric = assets.some(
      (asset) => asset?.source.kind === "procedural" && (asset.morphTargets?.length ?? 0) > 0,
    );
    const body = resolveAssetRef(parts.body);
    const bodyMorphsMoveSurfaces = Object.keys(body?.bodyProfile?.morphs ?? {}).length > 0;
    const fittedItems = assets.some(
      (asset) => asset !== undefined && asset !== body && asset.source.kind === "procedural",
    );
    const rebuilds = parametric || (bodyMorphsMoveSurfaces && fittedItems);
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

  // Pose: in-place joint rotation updates, gesture hands oriented from
  // their mudra's meaning, then held shafts re-verticalized.
  useEffect(() => {
    applyPose(rig.joints, pose);
    applyGestureOrientations(rig.joints, rig.hands);
    // Hands that are holding something are turned onto it before the
    // item is aligned, or the item lands between the fingers.
    applyGripOrientations(rig.joints, rig.held);
    alignUprightAttachments(rig);
  }, [rig, pose, hands]);

  // Morphs: in-place GPU influence updates (no geometry rebuild). Hand
  // gestures contribute their own influences on bodies that can close
  // their hands — see morphs.ts.
  useEffect(() => {
    applyMorphInfluences(rig.root, morphInfluences(morphs, hands, resolveAssetRef(parts.body)));
  }, [rig, morphs, hands, parts.body]);

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
