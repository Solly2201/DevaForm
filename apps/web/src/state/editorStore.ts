/**
 * Editor store — owns the CharacterConfiguration (the document) plus
 * character identity/persistence metadata.
 *
 * Undo/redo: the store is wrapped with zundo's temporal middleware,
 * partialized to the configuration only. UI state (active category,
 * lighting, dialogs) lives in uiStore and never pollutes history.
 */
import { create } from "zustand";
import { temporal } from "zundo";
import {
  createDefaultGaneshaConfiguration,
  getPalette,
  type ArmSlot,
  type AttachmentConfiguration,
  type BaseConfiguration,
  type CharacterConfiguration,
  type JointId,
  type MaterialZone,
  type MudraId,
  type PartSlot,
  type Proportions,
  type SocketId,
  type Vec3,
  type ZoneMaterial,
} from "@devaform/character-schema";
import { getAsset, latestRef } from "@devaform/asset-system";

export interface EditorState {
  config: CharacterConfiguration;
  characterId: string | null;
  characterName: string;
  /** Unsaved changes since last save/load. */
  dirty: boolean;

  // -- document mutations (undoable) --
  setPart: (slot: PartSlot, assetId: string | null) => void;
  setAttachment: (socket: SocketId, assetId: string | null) => void;
  setPosePreset: (presetId: string | null) => void;
  setJointOverride: (joint: JointId, rotation: Vec3) => void;
  clearJointOverride: (joint: JointId) => void;
  clearAllJointOverrides: () => void;
  setZoneMaterial: (zone: MaterialZone, material: Partial<ZoneMaterial>) => void;
  applyPalette: (paletteId: string) => void;
  setBase: (base: BaseConfiguration) => void;
  setProportions: (proportions: Partial<Proportions>) => void;
  setMorph: (name: string, value: number) => void;
  setMudra: (slot: ArmSlot, mudra: MudraId) => void;
  setArmCount: (count: 2 | 4) => void;

  // -- character lifecycle --
  setCharacterName: (name: string) => void;
  newCharacter: () => void;
  adoptLoadedCharacter: (input: {
    id: string;
    name: string;
    config: CharacterConfiguration;
  }) => void;
  markSaved: (id: string) => void;
}

function mutateConfig(
  state: EditorState,
  mutate: (config: CharacterConfiguration) => CharacterConfiguration,
): Pick<EditorState, "config" | "dirty"> {
  return { config: mutate(state.config), dirty: true };
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set) => ({
      config: createDefaultGaneshaConfiguration(),
      characterId: null,
      characterName: "My Ganesha",
      dirty: false,

      setPart: (slot, assetId) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            parts: { ...config.parts, [slot]: assetId ? latestRef(assetId) : null },
          })),
        ),

      setAttachment: (socket, assetId) =>
        set((state) =>
          mutateConfig(state, (config) => {
            let attachments: AttachmentConfiguration[] = config.attachments.filter(
              (a) => a.socket !== socket,
            );
            if (assetId) {
              const asset = getAsset(assetId);
              // Enforce exclusion rules (e.g. only one crown style at a time).
              if (asset?.excludes?.length) {
                attachments = attachments.filter(
                  (a) => !asset.excludes?.includes(a.asset.assetId),
                );
              }
              attachments = [...attachments, { socket, asset: latestRef(assetId) }];
            }
            return { ...config, attachments };
          }),
        ),

      setPosePreset: (presetId) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            // Changing preset clears overrides — they were relative tweaks
            // on the previous preset and rarely make sense on the new one.
            pose: { preset: presetId, jointOverrides: {} },
          })),
        ),

      setJointOverride: (joint, rotation) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            pose: {
              ...config.pose,
              jointOverrides: { ...config.pose.jointOverrides, [joint]: rotation },
            },
          })),
        ),

      clearJointOverride: (joint) =>
        set((state) =>
          mutateConfig(state, (config) => {
            const overrides = { ...config.pose.jointOverrides };
            delete overrides[joint];
            return { ...config, pose: { ...config.pose, jointOverrides: overrides } };
          }),
        ),

      clearAllJointOverrides: () =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            pose: { ...config.pose, jointOverrides: {} },
          })),
        ),

      setZoneMaterial: (zone, material) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            materials: {
              ...config.materials,
              [zone]: { ...config.materials[zone], ...material },
            },
          })),
        ),

      applyPalette: (paletteId) =>
        set((state) =>
          mutateConfig(state, (config) => {
            const palette = getPalette(paletteId);
            if (!palette) return config;
            return { ...config, materials: structuredClone(palette.materials) };
          }),
        ),

      setBase: (base) => set((state) => mutateConfig(state, (config) => ({ ...config, base }))),

      setMudra: (slot, mudra) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            hands: { ...config.hands, [slot]: { mudra } },
          })),
        ),

      setArmCount: (count) =>
        set((state) =>
          mutateConfig(state, (config) => ({ ...config, arms: { count } })),
        ),

      setProportions: (proportions) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            proportions: { ...config.proportions, ...proportions },
          })),
        ),

      setMorph: (name, value) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            morphs: { ...config.morphs, [name]: value },
          })),
        ),

      setCharacterName: (name) => set({ characterName: name, dirty: true }),

      newCharacter: () =>
        set({
          config: createDefaultGaneshaConfiguration(),
          characterId: null,
          characterName: "My Ganesha",
          dirty: false,
        }),

      adoptLoadedCharacter: ({ id, name, config }) =>
        set({ config, characterId: id, characterName: name, dirty: false }),

      markSaved: (id) => set({ characterId: id, dirty: false }),
    }),
    {
      // Only the document participates in undo history.
      partialize: (state) => ({ config: state.config }),
      equality: (pastState, currentState) => pastState.config === currentState.config,
      limit: 100,
      // Leading-edge throttle: a slider drag records the pre-drag state once
      // instead of pushing every intermediate frame into history.
      handleSet: (handleSet) => {
        let lastCall = 0;
        return (pastState) => {
          const now = Date.now();
          if (now - lastCall > 300) {
            handleSet(pastState);
          }
          lastCall = now;
        };
      },
    },
  ),
);

/** Hook into undo/redo state and actions. */
export const useTemporalStore = () => useEditorStore.temporal;
