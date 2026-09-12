"use client";

/** Camera view + lighting controls overlaid on the viewport. */
import { LIGHTING_PRESETS, type LightingPresetId } from "@/engine/lighting";
import { useUiStore, type CameraView } from "@/state/uiStore";

const VIEWS: ReadonlyArray<{ view: CameraView; label: string }> = [
  { view: "threeQuarter", label: "¾" },
  { view: "front", label: "Front" },
  { view: "back", label: "Back" },
  { view: "left", label: "Left" },
  { view: "right", label: "Right" },
];

export function ViewportOverlay() {
  const requestCameraView = useUiStore((s) => s.requestCameraView);
  const lightingPreset = useUiStore((s) => s.lightingPreset);
  const setLightingPreset = useUiStore((s) => s.setLightingPreset);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl border border-surface-700/80 bg-surface-900/85 p-1 backdrop-blur">
        {VIEWS.map(({ view, label }) => (
          <button
            key={view}
            type="button"
            onClick={() => requestCameraView(view)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-300 transition-colors hover:bg-surface-700 hover:text-saffron-400"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-surface-700/80 bg-surface-900/85 px-3 py-2 backdrop-blur">
        <span className="text-[11px] uppercase tracking-wide text-stone-500">Light</span>
        <select
          value={lightingPreset}
          onChange={(e) => setLightingPreset(e.target.value as LightingPresetId)}
          className="rounded-md border border-surface-700 bg-surface-850 px-2 py-1 text-xs text-stone-200"
        >
          {LIGHTING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
