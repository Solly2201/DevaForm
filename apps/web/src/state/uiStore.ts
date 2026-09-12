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
  lightingPreset: LightingPresetId;
  selectedJoint: JointId;
  /** Incremented with each camera command so the viewport can react. */
  cameraCommand: { view: CameraView; nonce: number };
  saveDialogOpen: boolean;
  statusMessage: { text: string; kind: "info" | "error" } | null;

  setActiveCategory: (id: string) => void;
  setLightingPreset: (id: LightingPresetId) => void;
  setSelectedJoint: (id: JointId) => void;
  requestCameraView: (view: CameraView) => void;
  setSaveDialogOpen: (open: boolean) => void;
  showStatus: (text: string, kind?: "info" | "error") => void;
  clearStatus: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeCategoryId: "head",
  lightingPreset: "studio",
  selectedJoint: "arm.frontRight.upper",
  cameraCommand: { view: "threeQuarter", nonce: 0 },
  saveDialogOpen: false,
  statusMessage: null,

  setActiveCategory: (id) => set({ activeCategoryId: id }),
  setLightingPreset: (id) => set({ lightingPreset: id }),
  setSelectedJoint: (id) => set({ selectedJoint: id }),
  requestCameraView: (view) =>
    set((state) => ({ cameraCommand: { view, nonce: state.cameraCommand.nonce + 1 } })),
  setSaveDialogOpen: (open) => set({ saveDialogOpen: open }),
  showStatus: (text, kind = "info") => set({ statusMessage: { text, kind } }),
  clearStatus: () => set({ statusMessage: null }),
}));
