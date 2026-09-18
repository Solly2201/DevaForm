/**
 * UI store — ephemeral editor UI state, deliberately separate from the
 * character document so it never enters undo history or saves.
 */
import { create } from "zustand";
import type { JointId } from "@devaform/character-schema";
import type { LightingPresetId } from "@/engine/lighting";

export type CameraView = "front" | "back" | "left" | "right" | "threeQuarter" | "face" | "reset";

interface UiState {
  activeCategoryId: string;
  /** Active subcategory within the category; null = first available. */
  activeSubcategoryId: string | null;
  lightingPreset: LightingPresetId;
  selectedJoint: JointId;
  /** Incremented with each camera command so the viewport can react. */
  cameraCommand: { view: CameraView; nonce: number };
  exportDialogOpen: boolean;
  /**
   * What just happened. `link` is for a message the customer has to be
   * able to KEEP — a share URL — which a toast that fades cannot deliver.
   */
  statusMessage: { text: string; kind: "info" | "error"; link?: string } | null;

  setActiveCategory: (id: string) => void;
  setActiveSubcategory: (id: string | null) => void;
  setLightingPreset: (id: LightingPresetId) => void;
  setSelectedJoint: (id: JointId) => void;
  requestCameraView: (view: CameraView) => void;
  setExportDialogOpen: (open: boolean) => void;
  showStatus: (text: string, kind?: "info" | "error", link?: string) => void;
  clearStatus: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeCategoryId: "head",
  activeSubcategoryId: null,
  lightingPreset: "sanctum",
  selectedJoint: "arm.frontRight.upper",
  cameraCommand: { view: "threeQuarter", nonce: 0 },
  exportDialogOpen: false,
  statusMessage: null,

  setActiveCategory: (id) => set({ activeCategoryId: id, activeSubcategoryId: null }),
  setActiveSubcategory: (id) => set({ activeSubcategoryId: id }),
  setLightingPreset: (id) => set({ lightingPreset: id }),
  setSelectedJoint: (id) => set({ selectedJoint: id }),
  requestCameraView: (view) =>
    set((state) => ({ cameraCommand: { view, nonce: state.cameraCommand.nonce + 1 } })),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),
  showStatus: (text, kind = "info", link) => set({ statusMessage: { text, kind, link } }),
  clearStatus: () => set({ statusMessage: null }),
}));

// Dev-only handle for QA automation, beside the editor store's. The
// interaction audit has to ask whether a control CHANGED anything, and
// half the Studio's controls change ephemeral UI state rather than the
// character — a camera preset that silently did nothing would otherwise
// be indistinguishable from one that worked.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __devaformUi?: typeof useUiStore }).__devaformUi = useUiStore;
}
