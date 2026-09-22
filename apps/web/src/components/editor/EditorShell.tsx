"use client";

/**
 * The Studio shell — and the stage it stands on.
 *
 * The presentation layers are hosted HERE, not inside the viewport,
 * because the entry experience owns the whole window: the backdrop is a
 * fixed fullscreen layer under everything, the entry is a fixed
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
import { StageVignette } from "@/presentation/StageVignette";
import { shouldShowEntry, useStageStore } from "@/presentation/stageStore";
import { useDeity } from "@/state/deityContext";
import { CategorySidebar } from "./CategorySidebar";
import { CustomizationPanel } from "./CustomizationPanel";
import { ExportDialog } from "./ExportDialog";
import { StatusToast } from "./StatusToast";
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
    const allowed = Boolean(stage.intro) && shouldShowEntry();
    setIntroAllowed(allowed);
    // Nothing to hand over from: the stage is the customer's at once,
    // and the statue still rises out of the dark, just promptly.
    if (!allowed) finishSettle();
  }, [stage.intro, finishSettle]);

  /**
   * The chrome is not merely invisible during the entry — it is not
   * THERE.
   *
   * It used to keep its layout while fading, which meant the viewport
   * stayed pinched between a hidden sidebar and a hidden panel, and the
   * stage frame — centred on the statue, which is centred in the viewport
   * — sat a hundred and thirty pixels left of the window's middle. The
   * temple opened visibly off to one side with nothing on screen to
   * explain why. A composition is centred or it is not; a customer
   * looking at an empty screen should see the doors in the middle of it.
   *
   * So the tools arrive WITH the statue, and the stage makes room for
   * them as they do: the viewport narrows, the frame re-measures, and the
   * room and the figure standing in it move together, which is one
   * motivated movement rather than a mystery.
   */
  const chromeHidden = phase === "intro";
  // Mounted a frame before it is shown, so the tools fade UP rather than
  // appearing: an element that arrives already opaque has nothing to
  // transition from.
  const [chromeIn, setChromeIn] = useState(false);
  useEffect(() => {
    if (chromeHidden) {
      setChromeIn(false);
      return;
    }
    const raf = requestAnimationFrame(() => setChromeIn(true));
    return () => cancelAnimationFrame(raf);
  }, [chromeHidden]);
  const chrome: React.CSSProperties = {
    opacity: chromeIn ? 1 : 0,
    transition: "opacity 700ms ease-out",
    pointerEvents: chromeIn ? "auto" : "none",
  };

  return (
    <div className="relative flex h-dvh flex-col bg-surface-950 text-stone-200">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {!chromeHidden && (
          <div style={chrome}>
            <TopBar />
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {!chromeHidden && (
            <div style={chrome}>
              <CategorySidebar />
            </div>
          )}
          {/* Transparent: the fixed backdrop behind it is the stage. */}
          <main className="relative min-w-0 flex-1">
            <EditorViewport stage={stage} />
            {/* The frame's edge, over the room rather than under it: the
                canvas is opaque now that the hall is geometry. */}
            <StageVignette />
            {/* Not merely invisible: not there. A control faded to zero
                is still in the tab order, and a customer who has not
                arrived yet could reach the camera presets with a Tab. */}
            {!chromeHidden && (
              <div style={chrome}>
                <ViewportOverlay />
              </div>
            )}
          </main>
          {!chromeHidden && (
            <div style={chrome}>
              <CustomizationPanel />
            </div>
          )}
        </div>
      </div>
      <ExportDialog />
      {/* Over the stage, not inside the top bar: feedback belongs where
          the customer is looking, and at a size that fits what it says. */}
      {!chromeHidden && <StatusToast />}
      {stage.intro && introAllowed === true && phase !== "ready" && (
        <PresentationEntry stage={stage} />
      )}
    </div>
  );
}
