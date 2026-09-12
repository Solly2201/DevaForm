"use client";

/**
 * Per-hand mudra selection. Only hands on rendered arms are shown; each
 * mudra is real hand geometry (see engine/generators/body.ts).
 */
import {
  MUDRAS,
  activeArmSlots,
  type ArmSlot,
  type MudraId,
} from "@devaform/character-schema";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { useEditorStore } from "@/state/editorStore";

const HAND_LABELS: Record<ArmSlot, string> = {
  frontLeft: "Front Left",
  frontRight: "Front Right",
  backLeft: "Back Left",
  backRight: "Back Right",
};

const MUDRA_LABELS: Record<MudraId, string> = {
  abhaya: "Abhaya",
  varada: "Varada",
  open: "Open",
  hold: "Hold",
};

const MUDRA_DESCRIPTIONS: Record<MudraId, string> = {
  abhaya: "Palm raised in blessing — fearlessness.",
  varada: "Palm offered downward — boon-giving.",
  open: "Relaxed open hand.",
  hold: "Fingers closed around a held attribute.",
};

const MUDRA_OPTIONS = MUDRAS.map((m) => ({ value: m, label: MUDRA_LABELS[m] }));

export function HandsPanel() {
  const hands = useEditorStore((s) => s.config.hands);
  const arms = useEditorStore((s) => s.config.arms);
  const setMudra = useEditorStore((s) => s.setMudra);
  const slots = activeArmSlots(arms);

  return (
    <div className="space-y-4">
      {slots.map((slot) => {
        const mudra = hands[slot]?.mudra ?? "open";
        return (
          <section key={slot} className="rounded-lg border border-surface-800 bg-surface-850 p-3">
            <h3 className="mb-2 text-xs font-semibold text-stone-300">{HAND_LABELS[slot]}</h3>
            <SegmentedControl<MudraId>
              options={MUDRA_OPTIONS}
              value={mudra}
              onChange={(m) => setMudra(slot, m)}
            />
            <p className="mt-2 text-[11px] text-stone-500">{MUDRA_DESCRIPTIONS[mudra]}</p>
          </section>
        );
      })}
      {arms.count === 2 && (
        <p className="text-[11px] text-stone-500">
          Back hands are hidden while the two-arm form is selected (Body panel).
        </p>
      )}
    </div>
  );
}
