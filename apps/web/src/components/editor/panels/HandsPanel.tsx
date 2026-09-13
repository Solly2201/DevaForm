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
  type SocketId,
} from "@devaform/character-schema";
import { getAsset, listAssets } from "@devaform/asset-system";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";

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
  hold: "Cradle",
  pinch: "Stem Hold",
  grip: "Weapon Grip",
};

const MUDRA_DESCRIPTIONS: Record<MudraId, string> = {
  abhaya: "Palm raised in blessing — fearlessness.",
  varada: "Palm offered downward — boon-giving.",
  open: "Relaxed open hand.",
  hold: "Palm-up cradle for offerings like the modak.",
  pinch: "Thumb and finger hold a stem — for the lotus.",
  grip: "Closed fist around a shaft — axe, noose, goad.",
};

const MUDRA_OPTIONS = MUDRAS.map((m) => ({ value: m, label: MUDRA_LABELS[m] }));

/** Held-item picker for one hand — kept in lockstep with the mudra. */
function HeldItemControl({ slot }: { slot: ArmSlot }) {
  const deity = useEditorStore((s) => s.config.deity);
  const socket = `arm.${slot}.hand.item` as SocketId;
  const attachment = useEditorStore((s) =>
    s.config.attachments.find((a) => a.socket === socket),
  );
  const setAttachment = useEditorStore((s) => s.setAttachment);
  const items = listAssets({ deity, socket });
  if (items.length === 0) return null;
  const heldId = attachment?.asset.assetId ?? "";
  return (
    <label className="mt-2 flex items-center gap-2 text-[11px] text-stone-400">
      <span className="shrink-0">Holding</span>
      <select
        value={heldId}
        onChange={(e) => setAttachment(socket, e.target.value || null)}
        className="w-full rounded-md border border-surface-700 bg-surface-900 px-2 py-1 text-xs text-stone-200"
      >
        <option value="">Nothing</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HandsPanel() {
  const hands = useEditorStore((s) => s.config.hands);
  const arms = useEditorStore((s) => s.config.arms);
  const attachments = useEditorStore((s) => s.config.attachments);
  const setMudra = useEditorStore((s) => s.setMudra);
  const showStatus = useUiStore((s) => s.showStatus);
  const slots = activeArmSlots(arms);

  const changeMudra = (slot: ArmSlot, m: MudraId) => {
    const held = attachments.find((a) => a.socket === `arm.${slot}.hand.item`);
    const heldAsset = held ? getAsset(held.asset.assetId) : undefined;
    if (heldAsset?.grip && heldAsset.grip.mudra !== m) {
      showStatus(`${heldAsset.name} unequipped — ${MUDRA_LABELS[m]} cannot hold it.`);
    }
    setMudra(slot, m);
  };

  return (
    <div className="space-y-4">
      {slots.map((slot) => {
        const mudra = hands[slot]?.mudra ?? "open";
        const held = attachments.find((a) => a.socket === `arm.${slot}.hand.item`);
        const heldAsset = held ? getAsset(held.asset.assetId) : undefined;
        const requiredMudra = heldAsset?.grip?.mudra;
        return (
          <section key={slot} className="rounded-lg border border-surface-800 bg-surface-850 p-3">
            <h3 className="mb-2 text-xs font-semibold text-stone-300">{HAND_LABELS[slot]}</h3>
            <SegmentedControl<MudraId>
              options={MUDRA_OPTIONS}
              value={mudra}
              onChange={(m) => changeMudra(slot, m)}
            />
            <p className="mt-2 text-[11px] text-stone-500">{MUDRA_DESCRIPTIONS[mudra]}</p>
            <HeldItemControl slot={slot} />
            {heldAsset && requiredMudra && requiredMudra !== mudra && (
              <p className="mt-1 text-[11px] text-saffron-400">
                {heldAsset.name} needs the {MUDRA_LABELS[requiredMudra]} grip.
              </p>
            )}
            {heldAsset && (
              <p className="mt-1 text-[11px] text-stone-500">
                Choosing a different gesture releases the {heldAsset.name}.
              </p>
            )}
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
