/**
 * UI store — ephemeral editor UI state, deliberately separate from the
 * character document so it never enters undo history or saves.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { JointId } from "@devaform/character-schema";
import { getPresentation } from "@devaform/asset-system";
import type { LightingPresetId } from "@/engine/lighting";
import {
  DEFAULT_STUDIO_LIGHTING,
  studioLightingFrom,
  type LightingControlKey,
  type StudioLighting,
} from "@/presentation/studioLighting";

export type CameraView = "front" | "back" | "left" | "right" | "threeQuarter" | "face" | "reset";

interface UiState {
  activeCategoryId: string;
  /** Active subcategory within the category; null = first available. */
  activeSubcategoryId: string | null;
  /**
   * THE STUDIO'S LIGHT, which is presentation and not the character.
   *
   * It used to be one preset id. The customer now adjusts key, fill, rim,
   * ambient, warmth, exposure and whether the key casts — see
   * presentation/studioLighting, which owns the model and the resolving.
   * It lives HERE rather than in the character document because a saved
   * creation is a statue and the light in the room is not part of one;
   * `plantedStage.test.ts` asserts that boundary and would fail if this
   * went the other way.
   */
  lighting: StudioLighting;
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
  setLightingValue: (key: LightingControlKey, value: number) => void;
  setLightingShadows: (on: boolean) => void;
  resetLighting: () => void;
  setSelectedJoint: (id: JointId) => void;
  requestCameraView: (view: CameraView) => void;
  setExportDialogOpen: (open: boolean) => void;
  showStatus: (text: string, kind?: "info" | "error", link?: string) => void;
  clearStatus: () => void;
}

/**
 * PERSISTED, and only this.
 *
 * Everything else in this store is this session's business — which panel
 * is open, what the camera was last asked to do, whether a dialog is up —
 * and restoring any of it would be a Studio that reopens mid-thought. The
 * light is not like that: it is a decision the customer made about how
 * their statue should look, and losing it on reload is losing work.
 *
 * To the browser's own storage rather than to the character, for the
 * reason above, and read back through `studioLightingFrom`, which cannot
 * fail: what comes out of localStorage may have been written by an older
 * Studio with different controls, or edited by hand, and none of that is
 * worth refusing to open over.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
  activeCategoryId: "head",
  activeSubcategoryId: null,
  /**
   * Opening in the light the STAGE declares.
   *
   * `PresentationConfig.lighting` has been on the sanctum since it was
   * written and nothing read it — the default here happened to be the
   * same string, so the two agreed by luck rather than by wiring. They
   * are wired now, and a stage that opens in temple light is a line of
   * configuration rather than a change here.
   */
  lighting: {
    ...DEFAULT_STUDIO_LIGHTING,
    preset: getPresentation().lighting as LightingPresetId,
  },
  selectedJoint: "arm.frontRight.upper",
  cameraCommand: { view: "threeQuarter", nonce: 0 },
  exportDialogOpen: false,
  statusMessage: null,

  setActiveCategory: (id) => set({ activeCategoryId: id, activeSubcategoryId: null }),
  setActiveSubcategory: (id) => set({ activeSubcategoryId: id }),
  setLightingPreset: (id) => set((state) => ({ lighting: { ...state.lighting, preset: id } })),
  setLightingValue: (key, value) =>
    set((state) => ({ lighting: { ...state.lighting, [key]: value } })),
  setLightingShadows: (on) => set((state) => ({ lighting: { ...state.lighting, shadows: on } })),
  // Back to the preset as authored, keeping the preset itself: "undo my
  // fiddling" and "show me a different rig" are different intentions.
  resetLighting: () =>
    set((state) => ({
      lighting: { ...DEFAULT_STUDIO_LIGHTING, preset: state.lighting.preset },
    })),
  setSelectedJoint: (id) => set({ selectedJoint: id }),
  requestCameraView: (view) =>
    set((state) => ({ cameraCommand: { view, nonce: state.cameraCommand.nonce + 1 } })),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),
  showStatus: (text, kind = "info", link) => set({ statusMessage: { text, kind, link } }),
  clearStatus: () => set({ statusMessage: null }),
    }),
    {
      name: "devaform.studio.presentation",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lighting: state.lighting }),
      merge: (persisted, current) => ({
        ...current,
        lighting: studioLightingFrom((persisted as { lighting?: unknown })?.lighting),
      }),
    },
  ),
);

// Dev-only handle for QA automation, beside the editor store's. The
// interaction audit has to ask whether a control CHANGED anything, and
// half the Studio's controls change ephemeral UI state rather than the
// character — a camera preset that silently did nothing would otherwise
// be indistinguishable from one that worked.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __devaformUi?: typeof useUiStore }).__devaformUi = useUiStore;
}
