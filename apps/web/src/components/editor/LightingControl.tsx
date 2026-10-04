"use client";

/**
 * The Studio's lighting control.
 *
 * WHAT IT REPLACES. A `<select>` with five entries in a chip in the
 * corner. Five rigs is five opinions about one statue, and a customer who
 * wants the key a little softer, or the whole image half a stop down for
 * a photograph, had nowhere to say so.
 *
 * WHY IT IS HERE AND NOT A CATEGORY PANEL. The right-hand panel is the
 * CHARACTER: head, hands, pose, materials, base — the statue somebody is
 * commissioning. The light in the room is not part of it, which the
 * repository already states in a test, and filing it beside "Hands" would
 * say it is. It belongs with the camera rail: both are the customer's
 * view OF the statue rather than the statue, and they sit together as
 * viewport chrome.
 *
 * It opens as a popover rather than living open, because the thing a
 * lighting control is for is looking at the figure while you move it, and
 * a panel that covers a third of the viewport is a control that fights
 * its own purpose.
 */
import { useEffect, useRef, useState } from "react";
import { LIGHTING_PRESETS } from "@/engine/lighting";
import type { LightingPresetId } from "@/engine/lighting";
import { LIGHTING_CONTROLS, isUnadjusted } from "@/presentation/studioLighting";
import { useUiStore } from "@/state/uiStore";

export function LightingControl() {
  const lighting = useUiStore((state) => state.lighting);
  const setPreset = useUiStore((state) => state.setLightingPreset);
  const setValue = useUiStore((state) => state.setLightingValue);
  const setShadows = useUiStore((state) => state.setLightingShadows);
  const reset = useUiStore((state) => state.resetLighting);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);

  /**
   * Closing on Escape and on a click elsewhere.
   *
   * A popover over a 3D viewport that only closes by its own button is a
   * popover that will be left open over the thing it is for.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const preset = LIGHTING_PRESETS.find((entry) => entry.id === lighting.preset);
  const adjusted = !isUnadjusted(lighting);

  return (
    <div ref={container} className="pointer-events-auto absolute right-4 top-4">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-xl border border-surface-700/80 bg-surface-900/85 px-3 py-2 text-xs text-stone-200 backdrop-blur transition-colors hover:border-surface-600 hover:text-saffron-400"
      >
        <span className="text-[11px] uppercase tracking-wide text-stone-500">Light</span>
        <span className="font-medium">{preset?.label ?? lighting.preset}</span>
        {/* That the rig has been adjusted is worth saying: otherwise a
            customer who turned the key down and reloaded has no way to
            tell this from the preset as authored. */}
        {adjusted && (
          <span
            className="rounded-full bg-saffron-500/20 px-1.5 py-0.5 text-[10px] font-medium text-saffron-400"
            title="Adjusted from the preset"
          >
            adj
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Studio lighting"
          className="mt-2 w-72 rounded-xl border border-surface-700 bg-surface-900/95 p-3 shadow-xl backdrop-blur"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Rig
          </p>
          <div className="mb-3 grid grid-cols-3 gap-1">
            {LIGHTING_PRESETS.map((entry) => {
              const active = entry.id === lighting.preset;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setPreset(entry.id as LightingPresetId)}
                  aria-pressed={active}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-saffron-500/60 bg-surface-700 text-saffron-400"
                      : "border-surface-700 bg-surface-850 text-stone-300 hover:border-surface-600 hover:text-saffron-400"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Adjust
          </p>
          <div className="space-y-2">
            {LIGHTING_CONTROLS.map((control) => (
              <label key={control.key} className="block">
                <span className="flex items-baseline justify-between text-[11px] text-stone-400">
                  {control.label}
                  <span className="tabular-nums text-stone-500">
                    {(lighting[control.key] as number).toFixed(2)}
                  </span>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={lighting[control.key] as number}
                  onChange={(event) => setValue(control.key, Number(event.target.value))}
                  className="w-full accent-saffron-500"
                />
              </label>
            ))}
          </div>

          <label className="mt-3 flex items-center justify-between text-[11px] text-stone-400">
            <span>
              Shadows
              {/* The one control here that is about cost rather than
                  look. One light casts; turning it off removes the whole
                  shadow pass, and the contact shadow still grounds the
                  figure. */}
              <span className="ml-1 text-stone-600">(cast)</span>
            </span>
            <input
              type="checkbox"
              checked={lighting.shadows}
              onChange={(event) => setShadows(event.target.checked)}
              className="h-4 w-4 accent-saffron-500"
            />
          </label>

          <button
            type="button"
            onClick={reset}
            disabled={!adjusted}
            className="mt-3 w-full rounded-lg border border-surface-700 bg-surface-850 px-2 py-1.5 text-[11px] font-medium text-stone-300 transition-colors enabled:hover:border-surface-600 enabled:hover:text-saffron-400 disabled:opacity-40"
          >
            Back to the preset
          </button>
        </div>
      )}
    </div>
  );
}
