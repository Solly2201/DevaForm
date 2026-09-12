"use client";

import dynamic from "next/dynamic";
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
  return (
    <div className="flex h-dvh flex-col bg-surface-950 text-stone-200">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <CategorySidebar />
        <main className="relative min-w-0 flex-1 bg-surface-950">
          <EditorViewport />
          <ViewportOverlay />
        </main>
        <CustomizationPanel />
      </div>
      <ExportDialog />
    </div>
  );
}
