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
import { AVAILABLE_DEITIES, getAsset, latestRef } from "@devaform/asset-system";

/** Bootstrap configuration: the first available deity's default. */
function createBootstrapConfiguration(): CharacterConfiguration {
  const deity = AVAILABLE_DEITIES[0];
  if (!deity) throw new Error("No available deity registered");
  return deity.createDefaultConfiguration();
}

const defaultName = (config: CharacterConfiguration) =>
  `My ${config.deity.charAt(0).toUpperCase()}${config.deity.slice(1)}`;

export interface EditorState {
  config: CharacterConfiguration;
  characterId: string | null;
  characterName: string;
  /** Unsaved changes since last save/load. */
  dirty: boolean;

  // -- document mutations (undoable) --
  setPart: (slot: PartSlot, assetId: string | null) => void;
  setAttachment: (socket: SocketId, assetId: string | null) => void;
  setAttachmentOffset: (
    socket: SocketId,
    offset: { position?: Vec3; rotation?: Vec3; scale?: number } | undefined,
  ) => void;
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
  /** Reset to a fresh configuration (the active deity's default). */
  newCharacter: (config?: CharacterConfiguration) => void;
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
      config: createBootstrapConfiguration(),
      characterId: null,
      characterName: defaultName(createBootstrapConfiguration()),
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
            let hands = config.hands;
            if (assetId) {
              const asset = getAsset(assetId);
              // Enforce exclusion rules (e.g. only one crown style at a time).
              if (asset?.excludes?.length) {
                attachments = attachments.filter(
                  (a) => !asset.excludes?.includes(a.asset.assetId),
                );
              }
              attachments = [...attachments, { socket, asset: latestRef(assetId) }];
              // Items declare how a hand should hold them — auto-apply the
              // grip mudra so the default always looks intentional.
              const handSlot = socket.match(/^arm\.(\w+)\.hand\.item$/)?.[1] as
                | ArmSlot
                | undefined;
              if (handSlot && asset?.grip) {
                hands = { ...hands, [handSlot]: { mudra: asset.grip.mudra } };
              }
            }
            return { ...config, attachments, hands };
          }),
        ),

      setAttachmentOffset: (socket, offset) =>
        set((state) =>
          mutateConfig(state, (config) => ({
            ...config,
            attachments: config.attachments.map((a) =>
              a.socket === socket ? { ...a, offset } : a,
            ),
          })),
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
          mutateConfig(state, (config) => {
            // A held item and its hand's mudra are one coherent state: if
            // the new mudra can't perform the item's declared grip, the
            // hand releases the item (data-driven via asset grip metadata).
            const socket = `arm.${slot}.hand.item`;
            const attachments = config.attachments.filter((a) => {
              if (a.socket !== socket) return true;
              const grip = getAsset(a.asset.assetId)?.grip;
              return !grip || grip.mudra === mudra;
            });
            return {
              ...config,
              attachments,
              hands: { ...config.hands, [slot]: { mudra } },
            };
          }),
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

      newCharacter: (config) =>
        set(() => {
          const next = config ?? createBootstrapConfiguration();
          return {
            config: next,
            characterId: null,
            characterName: defaultName(next),
            dirty: false,
          };
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

// Dev-only handle for QA automation (scripted editor state changes).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __devaformStore?: typeof useEditorStore }).__devaformStore = useEditorStore;
}
