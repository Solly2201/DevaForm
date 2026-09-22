"use client";

/**
 * Pose panel sections: preset selection plus per-body-part joint control.
 * Body-part grouping comes from the skeleton's declared uiGroup metadata
 * (see character-schema), so future rigs bring their own hierarchy —
 * nothing here is deity-specific. Joint sliders write real euler rotations
 * (clamped to joint limits) into pose.jointOverrides.
 *
 * A WRIST THAT IS SPOKEN FOR SAYS SO. A hand holding an attribute or
 * showing a mudra is aimed by the engine after the pose is applied, so a
 * rotation written onto it is overwritten before the frame is drawn. It
 * used to offer the slider anyway: it moved, the statue did not, and
 * nothing explained the difference. The joint is shown held instead, with
 * what is holding it — see solvedArms.
 */
import {
  type JointDefinition,
  type JointId,
} from "@devaform/character-schema";
import { resolveCharacterPresentation, solvedArms } from "@devaform/asset-system";
import { effectiveJointRotation } from "@/engine/pose";
import { SliderControl } from "@/components/controls/SliderControl";
import { useDeity } from "@/state/deityContext";
import { useEditorStore } from "@/state/editorStore";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const AXES = [
  { index: 0, key: "x", label: "Bend" },
  { index: 1, key: "y", label: "Twist" },
  { index: 2, key: "z", label: "Raise" },
] as const;

export function PosePresetsSection() {
  const deity = useDeity();
  const pose = useEditorStore((s) => s.config.pose);
  const setPosePreset = useEditorStore((s) => s.setPosePreset);
  const clearAllJointOverrides = useEditorStore((s) => s.clearAllJointOverrides);
  const overrideCount = Object.keys(pose.jointOverrides).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {deity.posePresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.description}
            onClick={() => setPosePreset(preset.id)}
            className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
              pose.preset === preset.id
                ? "border-saffron-500 bg-surface-700 text-saffron-400"
                : "border-surface-700 text-stone-400 hover:border-stone-500"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {overrideCount > 0 && (
        <button
          type="button"
          onClick={clearAllJointOverrides}
          className="w-full rounded-lg border border-surface-700 py-1.5 text-xs text-stone-400 hover:border-stone-500 hover:text-stone-200"
        >
          Reset all adjustments ({overrideCount})
        </button>
      )}
      <p className="text-[11px] text-stone-500">
        Fine-tune individual body parts in the sections on the left; presets
        reset those adjustments.
      </p>
    </div>
  );
}

function JointControls({ joint, held }: { joint: JointDefinition; held: string | null }) {
  const pose = useEditorStore((s) => s.config.pose);
  const setJointOverride = useEditorStore((s) => s.setJointOverride);
  const clearJointOverride = useEditorStore((s) => s.clearJointOverride);
  const rotation = effectiveJointRotation(pose, joint.id);
  const hasOverride = pose.jointOverrides[joint.id] !== undefined;
  const limits = [joint.limits?.x, joint.limits?.y, joint.limits?.z] as const;

  if (held) {
    return (
      <section className="rounded-lg border border-surface-800 bg-surface-900 p-3">
        <h4 className="text-xs font-semibold text-stone-400">{joint.label}</h4>
        <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{held}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-surface-800 bg-surface-850 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-stone-300">{joint.label}</h4>
        {hasOverride && (
          <button
            type="button"
            onClick={() => clearJointOverride(joint.id as JointId)}
            className="text-[11px] text-stone-500 underline-offset-2 hover:text-saffron-400 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {AXES.map((axis) => {
          const limit = limits[axis.index];
          return (
            <SliderControl
              key={axis.key}
              label={axis.label}
              value={rotation[axis.index] * RAD_TO_DEG}
              min={(limit?.[0] ?? -Math.PI) * RAD_TO_DEG}
              max={(limit?.[1] ?? Math.PI) * RAD_TO_DEG}
              step={1}
              format={(v) => `${Math.round(v)}°`}
              onChange={(degrees) => {
                const next: [number, number, number] = [...rotation];
                next[axis.index] = degrees * DEG_TO_RAD;
                setJointOverride(joint.id as JointId, next);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

/** The hand joint of an arm, e.g. "arm.frontRight.hand". */
const HAND_JOINT = /^arm\.([A-Za-z]+)\.hand$/;

/** All joints of one semantic body part (e.g. "Left Leg"), stacked. */
export function JointGroupSection({ joints }: { joints: readonly JointDefinition[] }) {
  const config = useEditorStore((s) => s.config);

  // Only worth resolving for a group that contains a hand — which is to
  // say, for the arms and for nothing else.
  const hasHand = joints.some((joint) => HAND_JOINT.test(joint.id));
  const solved: ReadonlySet<string> = hasHand
    ? solvedArms(resolveCharacterPresentation(config))
    : new Set<string>();

  const heldReason = (joint: JointDefinition): string | null => {
    const slot = HAND_JOINT.exec(joint.id)?.[1];
    if (!slot || !solved.has(slot)) return null;
    const holding = config.attachments.find(
      (attachment) => attachment.socket === `arm.${slot}.hand.item`,
    );
    return holding
      ? "Aimed by what this hand is holding. Empty the hand to adjust the wrist."
      : "Aimed by the gesture this hand is making. Choose an open hand to adjust the wrist.";
  };

  return (
    <div className="space-y-3">
      {joints.map((joint) => (
        <JointControls key={joint.id} joint={joint} held={heldReason(joint)} />
      ))}
    </div>
  );
}
