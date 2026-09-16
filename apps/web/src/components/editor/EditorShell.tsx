"use client";

import dynamic from "next/dynamic";
import { useStageStore } from "@/presentation/stageStore";
import { CategorySidebar } from "./CategorySidebar";
import { CustomizationPanel } from "./CustomizationPanel";
import { ExportDialog } from "./ExportDialog";
import { TopBar } from "./TopBar";
import { ViewportOverlay } from "./ViewportOverlay";

// The viewport touches WebGL — client-only, never server rendered.
const EditorViewport = dynamic(
  () => import("@/components/viewport/EditorViewport").then((m) => m.EditorViewport),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-stone-500">
        Preparing 3D viewport…
      </div>
    ),
  },
);

export function EditorShell() {
  const phase = useStageStore((state) => state.phase);
  /**
   * The tools recede while the entry sequence plays.
   *
   * Nothing MOVES. The viewport keeps its exact place and size, because
   * the frame the video ends on has to be the frame the stage begins on,
   * and a panel that slides open changes where that frame is. A veil over
   * the chrome leaves the geometry alone and still puts the eye where the
   * sequence is; the tools come back up as the statue does.
   */
  const dim = phase === "intro";
  const veil = {
    opacity: dim ? 1 : 0,
    transition: "opacity 700ms ease-out",
  } as const;

  return (
    <div className="flex h-dvh flex-col bg-surface-950 text-stone-200">
      <div className="relative">
        <TopBar />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-surface-950"
          style={veil}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative">
          <CategorySidebar />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-surface-950"
            style={veil}
          />
        </div>
        <main className="relative min-w-0 flex-1 bg-surface-950">
          <EditorViewport />
          <div style={{ opacity: dim ? 0 : 1, transition: "opacity 700ms ease-out" }}>
            <ViewportOverlay />
          </div>
        </main>
        <div className="relative">
          <CustomizationPanel />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-surface-950"
            style={veil}
          />
        </div>
      </div>
      <ExportDialog />
    </div>
  );
}
