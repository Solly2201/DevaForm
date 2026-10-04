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
 * GLB assets load asynchronously, and the rig WAITS for the ones this
 * configuration needs rather than being built twice — see `needed` below.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAssetRef } from "@devaform/asset-system";
import { useEditorStore } from "@/state/editorStore";
import { glbPathsFor } from "./assetReadiness";
import { getGlb, subscribeGlbCache } from "./glbCache";
import { ZoneMaterials } from "./materials";
import {
  buildRig,
  disposeRig,
  poseRig,
  rigMorphInfluences,
  rigWarnings,
  type CharacterRig,
} from "./rig";
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

  /**
   * The GLB files this configuration is going to ask for.
   *
   * Read off the configuration's own asset references, before anything is
   * built — which is the point. Rig assembly is synchronous and loading is
   * not, so the rig used to be built IMMEDIATELY, omit the meshes that had
   * not arrived, and then be built all over again when they did.
   *
   * Measured on Ganesha, whose sculpted head is an 84,000-triangle GLB:
   * two builds, 1.0 s and 1.1 s, each one a single unbroken task. The
   * first is pure waste — nobody ever sees a rig with the head missing,
   * because the entry is still covering the stage — and the second landed
   * in the middle of the customer's scroll through the entry, where it
   * froze the sequence outright: two animation frames in 1.7 seconds.
   *
   * So the build waits for what it needs. One build, and it happens while
   * the customer is still at the temple doors instead of halfway down the
   * hall.
   */
  const needed = useMemo(
    () => glbPathsFor(useEditorStore.getState().config),
    // The configuration's own asset references, and nothing else, decide
    // this: see glbPathsFor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parts, attachments],
  );

  /**
   * Whether every one of them has SETTLED — loaded, or failed.
   *
   * A failure is as settled as a success: the rig already renders what it
   * can and reports what it could not, and waiting forever for a file
   * that is not coming would mean an empty stage with no explanation.
   */
  const assetsReady = useMemo(() => {
    void glbVersion; // the cache changed; ask it again
    return needed.every((path) => getGlb(path).status !== "loading");
  }, [needed, glbVersion]);

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
  const rig: CharacterRig | null = useMemo(() => {
    if (!assetsReady) return null;
    const config = useEditorStore.getState().config;
    return buildRig(config, zoneMaterials);
    // `assetsReady` replaces the raw cache counter: the rig is rebuilt
    // when readiness CHANGES, not every time any file anywhere lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, attachments, base, proportions, proceduralMorphKey, hands, arms, posePreset, assetsReady, zoneMaterials]);

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

  // Pose: in-place joint rotation updates — joints, gestures, grips and
  // planted attributes, in the one order poseRig defines.
  useEffect(() => {
    if (rig) poseRig(rig, pose);
  }, [rig, pose, hands]);

  // Morphs: in-place GPU influence updates (no geometry rebuild). Hand
  // gestures contribute their own influences on bodies that can close
  // their hands — see morphs.ts.
  useEffect(() => {
    if (rig) applyMorphInfluences(rig.root, rigMorphInfluences(rig, morphs));
  }, [rig, morphs, hands, parts.body]);

  // Materials: in-place color/finish updates.
  useEffect(() => {
    zoneMaterials.applyConfiguration(materials);
  }, [zoneMaterials, materials]);

  useEffect(() => {
    if (!rig) return;
    const warnings = rigWarnings(rig);
    if (warnings.length > 0) {
      console.warn("Character rig warnings:", warnings);
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

  // Nothing until there is something complete to show. The stage knows:
  // StageReadiness reports no character, the entry holds its last frame
  // with the ember lit, and the customer never sees a half-built statue.
  if (!rig) return null;
  return <primitive object={rig.root} />;
}
