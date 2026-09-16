/**
 * Skeleton conformance — does an asset agree with the anatomy it claims?
 *
 * A body asset makes several independent claims: the skeleton it was built
 * for, the morph targets it exposes, which way its thumbs point, and the
 * surfaces it measured. Nothing used to check that those claims agreed
 * with each other or with the skeleton named, so a body could declare a
 * thumb axis for an arm it did not have, or a grip morph for a hand that
 * was never built, and the engine would simply find nothing at runtime and
 * carry on.
 *
 * That is the failure mode this module exists to end. An unsupported
 * combination should be a loud error at validation time, not a silent
 * fallback at render time.
 *
 * The GLB side of the contract — bones naming canonical joints, morph
 * targets actually present in the file — is checked by
 * `scripts/validate-assets.mjs`, which can read the binary. This is the
 * manifest side, and it runs in the test suite alongside the rest of the
 * semantic manifest validation.
 */
import {
  ARM_SLOTS,
  getSkeleton,
  type ArmSlot,
  type SkeletonDefinition,
} from "@devaform/character-schema";
import { getAvailableDeity } from "./deities";
import { isHandheld } from "./presentation";
import type { AssetDefinition } from "./types";

export interface ConformanceIssue {
  assetId: string;
  /** An error means the combination cannot work; a warning means it is odd. */
  severity: "error" | "warning";
  message: string;
}

/** The morph a body declares to say "this hand is modelled closed". */
export function gripMorphName(slot: ArmSlot): string {
  return `grip${slot[0]!.toUpperCase()}${slot.slice(1)}`;
}

const GRIP_MORPH_SLOTS = new Map<string, ArmSlot>(
  ARM_SLOTS.map((slot) => [gripMorphName(slot), slot]),
);

/**
 * Check one asset against one skeleton it may be built on.
 *
 * `skeleton` is the anatomy this asset would actually run against: the one
 * it names, or — for a procedural body that names none — the deity's.
 */
export function validateSkeletonConformance(
  asset: AssetDefinition,
  skeleton: SkeletonDefinition,
): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const problem = (message: string, severity: "error" | "warning" = "error") =>
    issues.push({ assetId: asset.id, severity, message });

  const armSlots = new Set<string>(skeleton.armSlots);
  const sockets = new Set(skeleton.sockets.map((s) => s.id));

  // 1. Thumb axes describe hands. Every hand, and only the hands there are.
  if (asset.gripAxes) {
    for (const slot of Object.keys(asset.gripAxes)) {
      if (!armSlots.has(slot)) {
        problem(
          `declares a thumb axis for ${slot}, which skeleton "${skeleton.id}" does not have`,
        );
      }
    }
    const missing = [...armSlots].filter((slot) => !asset.gripAxes?.[slot]);
    if (missing.length > 0 && missing.length < armSlots.size) {
      // Some but not all: the body measured one hand and forgot the other,
      // and a hand with no measured axis silently falls back to the
      // contract's default while its twin uses the measurement.
      problem(`measured thumb axes for some hands but not ${missing.join(", ")}`);
    }
  }

  // 2. A grip morph closes a specific hand. It needs that hand to exist.
  for (const morph of asset.morphTargets ?? []) {
    const slot = GRIP_MORPH_SLOTS.get(morph);
    if (slot && !armSlots.has(slot)) {
      problem(`exposes ${morph}, but skeleton "${skeleton.id}" has no ${slot} arm`);
    }
    if (slot && !asset.gripAxes?.[slot]) {
      // A modelled hand is turned onto what it holds using its measured
      // thumb axis. Without one it is turned using a guess.
      problem(
        `exposes ${morph} but measured no thumb axis for ${slot}`,
        "warning",
      );
    }
  }

  // 3. An attachment must be able to reach the sockets it claims.
  if (asset.kind.type === "attachment") {
    const reachable = asset.kind.sockets.filter((socket) => sockets.has(socket));
    if (reachable.length === 0) {
      problem(
        `attaches only to ${asset.kind.sockets.join(", ")}, none of which skeleton "${skeleton.id}" has`,
      );
    }
  }

  // 4. Per-socket calibration for a socket that does not exist is dead
  //    data, and dead data is how a stale offset survives a refactor.
  for (const socket of Object.keys(asset.socketTransforms ?? {})) {
    // Suffix keys ("item") deliberately match a family of sockets.
    const isSuffix = !socket.includes(".");
    if (!isSuffix && !sockets.has(socket as never)) {
      problem(`has a socketTransform for ${socket}, which skeleton "${skeleton.id}" has no such socket`, "warning");
    }
  }

  // 5. A presentation must be reachable on this anatomy.
  for (const presentation of asset.presentations ?? []) {
    const where = `presentation "${presentation.id}"`;
    if (presentation.anchor.kind === "socket" && !sockets.has(presentation.anchor.socket)) {
      problem(`${where} anchors to ${presentation.anchor.socket}, which skeleton "${skeleton.id}" does not have`);
    }
    if (presentation.anchor.kind === "hand" && armSlots.size === 0) {
      problem(`${where} needs a hand, and skeleton "${skeleton.id}" has no arms`);
    }
    if (presentation.anchor.kind === "ground" && !sockets.has("base.platform")) {
      problem(`${where} stands on the base, and skeleton "${skeleton.id}" has no base.platform socket`);
    }
  }

  return issues;
}

/**
 * Checks that depend only on the asset, not on an anatomy.
 *
 * These are about a presentation agreeing WITH ITSELF: that a grounded one
 * needs no hand, that a grip axis points somewhere, that a hand is not
 * asked to slide onto a part of the object nobody grips. An unsupported
 * combination is a loud error here rather than a silent oddity at render
 * time.
 */
export function validatePresentations(asset: AssetDefinition): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const problem = (message: string, severity: "error" | "warning" = "error") =>
    issues.push({ assetId: asset.id, severity, message });

  const presentations = asset.presentations ?? [];
  const seen = new Set<string>();
  for (const presentation of presentations) {
    const where = `presentation "${presentation.id}"`;
    if (seen.has(presentation.id)) problem(`declares ${where} twice`);
    seen.add(presentation.id);

    // A presentation that needs no hand must not claim one, and one that
    // does must say which — this is the invariant that stopped a "grounded"
    // trishul from quietly still requiring a fist.
    if (presentation.mode === "grounded" && presentation.hand !== "none") {
      problem(`${where} is grounded but requires a ${presentation.hand} hand`);
    }
    if (presentation.mode === "handheld" && presentation.hand === "none") {
      problem(`${where} is handheld but requires no hand`);
    }
    if (presentation.mode === "grounded" && !presentation.stand) {
      problem(`${where} is grounded but does not say how far clear of the figure it stands`);
    }
    if (presentation.mobile && !isHandheld(presentation)) {
      problem(`${where} is marked mobile but is not held in a hand`, "warning");
    }

    const grip = presentation.grip;
    if (grip) {
      if (grip.axis) {
        const length = Math.hypot(grip.axis[0], grip.axis[1], grip.axis[2]);
        if (length < 1e-6) problem(`${where} declares a zero-length grip axis`);
      }
      if (grip.radius !== undefined && !(grip.radius > 0)) {
        problem(`${where} declares a non-positive grip radius`);
      }
      for (const [direction, distance] of [
        ["up", grip.travel?.up],
        ["down", grip.travel?.down],
      ] as const) {
        if (distance !== undefined && !(distance >= 0)) {
          problem(`${where} declares a negative ${direction} travel`);
        }
      }
    }
    if (isHandheld(presentation) && !grip?.radius) {
      // Without it the hand closes to whatever diameter it was modelled
      // at, which is how fingers end up through a drum head.
      problem(`${where} is held but does not say how thick the asset is where the hand closes`, "warning");
    }
    if (presentation.orientation === "worldUpright" && presentation.mode === "bodyMounted") {
      problem(`${where} is mounted on the body yet asks to stay world-upright`, "warning");
    }
  }

  // Handheld presentations need hand sockets to have been offered.
  if (asset.kind.type === "attachment" && presentations.some(isHandheld)) {
    if (!asset.kind.sockets.some((socket) => socket.endsWith(".hand.item"))) {
      problem(`declares a handheld presentation but offers no hand socket`);
    }
  }
  return issues;
}

/**
 * Every asset against every skeleton it can actually be rendered on.
 *
 * A body names its skeleton. Everything else runs on whichever skeletons
 * its compatible deities bring, so it is checked against each of them —
 * an ornament that only fits a trunk is fine on Ganesha and must not be
 * offered to anyone else.
 */
export function validateRegistryConformance(
  assets: readonly AssetDefinition[],
): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  for (const asset of assets) {
    // Self-consistency first: it does not depend on an anatomy, and an
    // asset that disagrees with itself would otherwise be reported once
    // per deity that can wear it.
    issues.push(...validatePresentations(asset));
    if (asset.skeleton !== undefined) {
      const skeleton = getSkeleton(asset.skeleton);
      if (!skeleton) {
        issues.push({
          assetId: asset.id,
          severity: "error",
          message: `names skeleton "${asset.skeleton}", which does not exist`,
        });
        continue;
      }
      if (!(asset.kind.type === "part" && asset.kind.slot === "body")) {
        issues.push({
          assetId: asset.id,
          severity: "error",
          message: `names a skeleton but is not a body part — only a body defines anatomy`,
        });
      }
      issues.push(...validateSkeletonConformance(asset, skeleton));
      continue;
    }

    // No declared skeleton: it runs on whatever its deities bring.
    for (const deityId of asset.deityCompatibility) {
      if (deityId === "any") continue;
      const deity = getAvailableDeity(deityId);
      if (!deity) continue;
      issues.push(...validateSkeletonConformance(asset, deity.skeleton));
    }
  }
  return issues;
}
