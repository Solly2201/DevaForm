"use client";

import { baseConfigurationSchema } from "@devaform/character-schema";
import { useEditorStore } from "@/state/editorStore";

const STYLE_LABELS: Record<string, string> = {
  none: "No Base",
  round: "Round Pedestal",
  square: "Square Plinth",
  lotus: "Lotus Seat",
  peetam: "Peetam Tier",
};

export function BasePanel() {
  const base = useEditorStore((s) => s.config.base);
  const setBase = useEditorStore((s) => s.setBase);
  const styles = baseConfigurationSchema.shape.style.options;

  return (
    <div className="grid grid-cols-2 gap-2">
      {styles.map((style) => (
        <button
          key={style}
          type="button"
          onClick={() => setBase({ style })}
          className={`rounded-lg border px-2 py-3 text-xs font-medium transition-colors ${
            base.style === style
              ? "border-saffron-500 bg-surface-700 text-saffron-400"
              : "border-surface-700 text-stone-400 hover:border-stone-500"
          }`}
        >
          {STYLE_LABELS[style] ?? style}
        </button>
      ))}
    </div>
  );
}
