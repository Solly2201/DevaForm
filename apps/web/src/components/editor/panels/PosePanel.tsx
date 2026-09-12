"use client";

/**
 * Pose panel: preset selection plus direct joint rotation control.
 * Joint sliders write real euler rotations (clamped to joint limits) into
 * pose.jointOverrides — the engine applies them to actual THREE joints.
 */
import {
  POSE_PRESETS,
  SKELETON,
  getJoint,
  type JointId,
} from "@devaform/character-schema";
import { effectiveJointRotation } from "@/engine/pose";
import { SliderControl } from "@/components/controls/SliderControl";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const AXES = [
  { index: 0, key: "x", label: "Bend (X)" },
  { index: 1, key: "y", label: "Twist (Y)" },
  { index: 2, key: "z", label: "Raise (Z)" },
] as const;

/** Joints worth exposing individually in the UI (root excluded). */
const POSEABLE_JOINTS = SKELETON.filter((j) => j.id !== "root");

export function PosePanel() {
  const pose = useEditorStore((s) => s.config.pose);
  const setPosePreset = useEditorStore((s) => s.setPosePreset);
  const setJointOverride = useEditorStore((s) => s.setJointOverride);
  const clearJointOverride = useEditorStore((s) => s.clearJointOverride);
  const clearAllJointOverrides = useEditorStore((s) => s.clearAllJointOverrides);
  const selectedJoint = useUiStore((s) => s.selectedJoint);
  const setSelectedJoint = useUiStore((s) => s.setSelectedJoint);

  const jointDef = getJoint(selectedJoint);
  const rotation = effectiveJointRotation(pose, selectedJoint);
  const hasOverride = pose.jointOverrides[selectedJoint] !== undefined;
  const overrideCount = Object.keys(pose.jointOverrides).length;

  const limits = [jointDef.limits?.x, jointDef.limits?.y, jointDef.limits?.z] as const;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Pose Presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {POSE_PRESETS.map((preset) => (
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
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Joint Control
          </h3>
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={clearAllJointOverrides}
              className="text-[11px] text-stone-500 underline-offset-2 hover:text-saffron-400 hover:underline"
            >
              Reset all ({overrideCount})
            </button>
          )}
        </div>
        <select
          value={selectedJoint}
          onChange={(e) => setSelectedJoint(e.target.value as JointId)}
          className="mb-3 w-full rounded-lg border border-surface-700 bg-surface-850 px-2 py-1.5 text-xs text-stone-200"
        >
          {POSEABLE_JOINTS.map((joint) => (
            <option key={joint.id} value={joint.id}>
              {joint.label}
            </option>
          ))}
        </select>
        <div className="space-y-3">
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
                  setJointOverride(selectedJoint, next);
                }}
              />
            );
          })}
        </div>
        {hasOverride && (
          <button
            type="button"
            onClick={() => clearJointOverride(selectedJoint)}
            className="mt-3 w-full rounded-lg border border-surface-700 py-1.5 text-xs text-stone-400 hover:border-stone-500 hover:text-stone-200"
          >
            Reset this joint to preset
          </button>
        )}
      </section>
    </div>
  );
}
