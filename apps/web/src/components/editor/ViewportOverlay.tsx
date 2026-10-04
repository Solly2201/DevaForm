"use client";

/** Camera view + lighting controls overlaid on the viewport. */
import { useUiStore, type CameraView } from "@/state/uiStore";
import { LightingControl } from "./LightingControl";

const VIEWS: ReadonlyArray<{ view: CameraView; label: string }> = [
  { view: "threeQuarter", label: "¾" },
  { view: "front", label: "Front" },
  { view: "face", label: "Face" },
  { view: "back", label: "Back" },
  { view: "left", label: "Left" },
  { view: "right", label: "Right" },
];

export function ViewportOverlay() {
  const requestCameraView = useUiStore((s) => s.requestCameraView);
  const currentView = useUiStore((s) => s.cameraCommand.view);

  return (
    <>
      <div
        className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl border border-surface-700/80 bg-surface-900/85 p-1 backdrop-blur"
        role="group"
        aria-label="Camera view"
      >
        {VIEWS.map(({ view, label }) => {
          // WHICH view they are looking from. Six identical buttons said
          // nothing about where the camera was, so the only way to find
          // out was to click one and compare.
          // Reset lands on the hero composition, which IS the ¾ view, so
          // the rail agrees with where the camera actually is.
          const active = view === currentView || (view === "threeQuarter" && currentView === "reset");
          return (
            <button
              key={view}
              type="button"
              onClick={() => requestCameraView(view)}
              aria-pressed={active}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-surface-700 text-saffron-400"
                  : "text-stone-300 hover:bg-surface-700 hover:text-saffron-400"
              }`}
            >
              {label}
            </button>
          );
        })}
        {/* The way back. A customer who has orbited, zoomed and panned
            somewhere unhelpful needs one control that undoes all three,
            and the stage already knows its own composition. */}
        <span aria-hidden className="mx-0.5 my-1 w-px bg-surface-700" />
        <button
          type="button"
          onClick={() => requestCameraView("reset")}
          title="Return to the stage's own view"
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 transition-colors hover:bg-surface-700 hover:text-saffron-400"
        >
          Reset
        </button>
      </div>
      <LightingControl />
    </>
  );
}
