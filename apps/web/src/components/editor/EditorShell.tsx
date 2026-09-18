"use client";

/**
 * The Studio shell — and the stage it stands on.
 *
 * The presentation layers are hosted HERE, not inside the viewport,
 * because the entry experience owns the whole window: the backdrop is a
 * fixed fullscreen layer under everything, the entry video is a fixed
 * fullscreen layer over everything, and the editor chrome lives between
 * them, hidden until the sequence hands over. That is what makes the
 * final video frame and the first stage frame the same picture — both
 * are fullscreen, both are placed by the same measured geometry, and the
 * chrome merely appears on top when the Studio becomes the customer's.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getPresentation } from "@devaform/asset-system";
import { PresentationEntry } from "@/presentation/PresentationEntry";
import { StageBackdrop } from "@/presentation/StageBackdrop";
import { StageVignette } from "@/presentation/StageVignette";
import { shouldPlayIntro, useStageStore } from "@/presentation/stageStore";
import { useDeity } from "@/state/deityContext";
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
  const deity = useDeity();
  const stage = getPresentation(deity.id);
  const phase = useStageStore((state) => state.phase);
  const finishSettle = useStageStore((state) => state.finishSettle);

  /**
   * Whether this visit gets the entry sequence — decided once, on the
   * client. `null` until it is decided, and the video does not mount
   * until then: the element starts fetching five megabytes the moment it
   * exists, and a customer on their second Studio visit of the session
   * has already seen the temple and should not pay for it again.
   */
  const [introAllowed, setIntroAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    const allowed = Boolean(stage.intro) && shouldPlayIntro();
    setIntroAllowed(allowed);
    // Nothing to hand over from: the stage is the customer's at once,
    // and the statue still rises out of the dark, just promptly.
    if (!allowed) finishSettle();
  }, [stage.intro, finishSettle]);

  const hasBackdrop = Boolean(stage.backdrop.image);

  /**
   * The chrome recedes entirely during the entry. Nothing MOVES — the
   * layout keeps its exact geometry, because the stage frame is measured
   * against the viewport's place in it — the tools simply are not there
   * until the statue is, and fade up as it does.
   */
  const chromeHidden = phase === "intro";
  const chrome: React.CSSProperties = {
    opacity: chromeHidden ? 0 : 1,
    transition: "opacity 700ms ease-out",
    pointerEvents: chromeHidden ? "none" : "auto",
  };

  return (
    <div className="relative flex h-dvh flex-col bg-surface-950 text-stone-200">
      {hasBackdrop && <StageBackdrop config={stage.backdrop} />}
      {hasBackdrop && <StageVignette />}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div style={chrome}>
          <TopBar />
        </div>
        <div className="flex min-h-0 flex-1">
          <div style={chrome}>
            <CategorySidebar />
          </div>
          {/* Transparent: the fixed backdrop behind it is the stage. */}
          <main className="relative min-w-0 flex-1">
            <EditorViewport stage={stage} />
            <div style={chrome}>
              <ViewportOverlay />
            </div>
          </main>
          <div style={chrome}>
            <CustomizationPanel />
          </div>
        </div>
      </div>
      <ExportDialog />
      {stage.intro && introAllowed === true && phase !== "ready" && (
        <PresentationEntry stage={stage} />
      )}
    </div>
  );
}
