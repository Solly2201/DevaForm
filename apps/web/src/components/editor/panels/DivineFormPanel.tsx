"use client";

/**
 * Which divine form is being made.
 *
 * Divine Studio used to be three editors wearing one name: the deity was
 * the ROUTE, so changing your mind about which god you were making meant
 * finding /studio/vishnu, and a customer who arrived at the Studio had
 * already had to choose before they could see anything. It is one editor
 * now, and the form is a choice inside it — beside the hair and the
 * pose, because that is where a customer looks for it.
 *
 * SWITCHING IS DESTRUCTIVE and says so. The Studio holds one creation,
 * and the forms do not share a configuration: Vishnu's four arms, his
 * attributes and his skeleton are not Shiva's, and merging them would
 * produce a character neither of them is. So an unsaved creation is
 * confirmed before it is replaced, by name, with the form being left and
 * the form being taken both stated.
 */
import { useState } from "react";
import { AVAILABLE_DEITIES, DEITIES, type DeityDefinition } from "@devaform/asset-system";
import { useEditorStore } from "@/state/editorStore";
import { ConfirmDialog, type Confirmation } from "../ConfirmDialog";
import { useUiStore } from "@/state/uiStore";

export function DivineFormPanel() {
  const current = useEditorStore((s) => s.config.deity);
  const switchDeity = useEditorStore((s) => s.switchDeity);
  const showStatus = useUiStore((s) => s.showStatus);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const take = (deity: DeityDefinition) => {
    if (!deity.available || deity.id === current) return;
    const leaving = DEITIES.find((entry) => entry.id === current);
    const go = () => {
      switchDeity(deity.id);
      showStatus(`Now creating ${deity.name}`);
    };
    if (!useEditorStore.getState().dirty) {
      go();
      return;
    }
    setConfirmation({
      title: "Switch divine form?",
      body: `Your changes to ${leaving?.name ?? "this creation"} have not been saved. Switching to ${deity.name} starts a new creation and leaves them behind.`,
      confirmLabel: `Switch to ${deity.name}`,
      destructive: true,
      onConfirm: go,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-stone-400">
        Each form is its own creation — its own body, attributes and iconography. Saving keeps
        them apart, so you can come back to any of them from your library.
      </p>
      <ul className="grid grid-cols-1 gap-2">
        {DEITIES.map((deity) => {
          const selected = deity.id === current;
          const offered = deity.available;
          return (
            <li key={deity.id}>
              <button
                type="button"
                onClick={() => take(deity)}
                disabled={!offered}
                aria-pressed={selected}
                aria-current={selected ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-saffron-500 bg-surface-700"
                    : offered
                      ? "border-surface-700 bg-surface-850 hover:border-stone-500"
                      : "cursor-not-allowed border-surface-800 bg-surface-900 opacity-55"
                }`}
              >
                <span
                  aria-hidden
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: deity.accent }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-stone-100">
                    {deity.name}
                  </span>
                  <span className="block truncate text-[11px] text-stone-500">
                    {deity.epithet}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-stone-500">
                  {selected ? "Creating" : offered ? "" : "In preparation"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {AVAILABLE_DEITIES.length < DEITIES.length && (
        <p className="text-[11px] leading-relaxed text-stone-600">
          More forms are being prepared. A form appears here the day its iconography is
          finished — the registry is what fills this list.
        </p>
      )}
      <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
    </div>
  );
}
