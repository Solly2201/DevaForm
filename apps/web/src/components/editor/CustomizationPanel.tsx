"use client";

/**
 * Right-hand customization panel. Renders entirely from category metadata:
 * part categories get asset grids per slot, socket categories get asset
 * grids per socket, and hands/pose/materials/base render dedicated panels.
 */
import {
  GANESHA_EDITOR_CATEGORIES,
  listAssets,
  type EditorCategory,
} from "@devaform/asset-system";
import {
  FACE_MORPHS,
  activeArmSlots,
  getSocket,
  type PartSlot,
  type SocketId,
} from "@devaform/character-schema";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";
import { AssetGrid } from "./AssetGrid";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { SliderControl } from "@/components/controls/SliderControl";
import { BasePanel } from "./panels/BasePanel";
import { HandsPanel } from "./panels/HandsPanel";
import { MaterialsPanel } from "./panels/MaterialsPanel";
import { PosePanel } from "./panels/PosePanel";

const SLOT_LABELS: Record<PartSlot, string> = {
  body: "Body",
  head: "Head",
  eyes: "Eyes",
  ears: "Ears",
  trunk: "Trunk",
  tusks: "Tusks",
  hair: "Hair",
  hands: "Hand Style",
  lowerGarment: "Dhoti",
  upperGarment: "Upper Garment",
  earrings: "Earrings",
  armlets: "Armlets",
  bracelets: "Bracelets",
  anklets: "Anklets",
};

/** Slots the user may intentionally leave empty. */
const OPTIONAL_SLOTS: readonly PartSlot[] = [
  "upperGarment",
  "hair",
  "earrings",
  "armlets",
  "bracelets",
  "anklets",
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 first:mt-0">
      {children}
    </h3>
  );
}

function PartSlotSection({ slot }: { slot: PartSlot }) {
  const deity = useEditorStore((s) => s.config.deity);
  const selected = useEditorStore((s) => s.config.parts[slot]);
  const setPart = useEditorStore((s) => s.setPart);
  const assets = listAssets({ deity, slot });
  if (assets.length === 0 && !selected) return null;
  return (
    <section>
      <SectionHeading>{SLOT_LABELS[slot]}</SectionHeading>
      <AssetGrid
        assets={assets}
        selectedAssetId={selected?.assetId ?? null}
        allowNone={OPTIONAL_SLOTS.includes(slot)}
        onSelect={(assetId) => setPart(slot, assetId)}
      />
    </section>
  );
}

function SocketSection({ socket, allowNone }: { socket: SocketId; allowNone: boolean }) {
  const deity = useEditorStore((s) => s.config.deity);
  const attachment = useEditorStore((s) =>
    s.config.attachments.find((a) => a.socket === socket),
  );
  const setAttachment = useEditorStore((s) => s.setAttachment);
  const assets = listAssets({ deity, socket });
  if (assets.length === 0) return null;
  return (
    <section>
      <SectionHeading>{getSocket(socket).label}</SectionHeading>
      <AssetGrid
        assets={assets}
        selectedAssetId={attachment?.asset.assetId ?? null}
        allowNone={allowNone}
        onSelect={(assetId) => setAttachment(socket, assetId)}
      />
    </section>
  );
}

function ProportionsSection() {
  const proportions = useEditorStore((s) => s.config.proportions);
  const setProportions = useEditorStore((s) => s.setProportions);
  return (
    <section>
      <SectionHeading>Proportions</SectionHeading>
      <div className="space-y-3">
        <SliderControl
          label="Height"
          value={proportions.height}
          min={0.8}
          max={1.2}
          onChange={(height) => setProportions({ height })}
        />
        <SliderControl
          label="Bulk"
          value={proportions.bulk}
          min={0.8}
          max={1.3}
          onChange={(bulk) => setProportions({ bulk })}
        />
      </div>
    </section>
  );
}

function ArmCountSection() {
  const arms = useEditorStore((s) => s.config.arms);
  const setArmCount = useEditorStore((s) => s.setArmCount);
  return (
    <section>
      <SectionHeading>Arms</SectionHeading>
      <SegmentedControl<"2" | "4">
        options={[
          { value: "4", label: "Four Arms (Chaturbhuja)" },
          { value: "2", label: "Two Arms" },
        ]}
        value={String(arms.count) as "2" | "4"}
        onChange={(value) => setArmCount(Number(value) as 2 | 4)}
      />
      <p className="mt-2 text-[11px] text-stone-500">
        Items held by hidden back hands are kept and reappear with four arms.
      </p>
    </section>
  );
}

function FaceMorphSection() {
  const morphs = useEditorStore((s) => s.config.morphs);
  const setMorph = useEditorStore((s) => s.setMorph);
  return (
    <section>
      <SectionHeading>Face Shaping</SectionHeading>
      <div className="space-y-3">
        {FACE_MORPHS.map((m) => (
          <SliderControl
            key={m.id}
            label={m.label}
            value={morphs[m.id] ?? 0}
            min={-1}
            max={1}
            step={0.05}
            onChange={(value) => setMorph(m.id, value)}
          />
        ))}
      </div>
    </section>
  );
}

/** Hand-item sockets on hidden arms are filtered from socket categories. */
function useVisibleSockets(sockets: readonly SocketId[]): SocketId[] {
  const arms = useEditorStore((s) => s.config.arms);
  const active = activeArmSlots(arms);
  return sockets.filter((socket) => {
    const match = socket.match(/^arm\.(\w+)\.hand\.item$/);
    if (!match) return true;
    return (active as readonly string[]).includes(match[1] ?? "");
  });
}

function SocketSections({
  sockets,
  allowNone,
}: {
  sockets: readonly SocketId[];
  allowNone: boolean;
}) {
  const visible = useVisibleSockets(sockets);
  return (
    <>
      {visible.map((socket) => (
        <SocketSection key={socket} socket={socket} allowNone={allowNone} />
      ))}
    </>
  );
}

/**
 * Companion placement around the base. Offsets are applied on top of the
 * asset's default transform, so "Right" (the default) is a zero offset.
 */
const COMPANION_SPOTS: ReadonlyArray<{
  id: "right" | "front" | "left";
  label: string;
  offset: { position: [number, number, number] } | undefined;
}> = [
  { id: "right", label: "Right", offset: undefined },
  { id: "front", label: "Front", offset: { position: [-0.2, 0, 0.1] } },
  { id: "left", label: "Left", offset: { position: [-0.48, 0, -0.15] } },
];

function CompanionPlacementSection() {
  const attachment = useEditorStore((s) =>
    s.config.attachments.find((a) => a.socket === "base.platform"),
  );
  const setAttachmentOffset = useEditorStore((s) => s.setAttachmentOffset);
  if (!attachment) return null;
  const activeId =
    COMPANION_SPOTS.find(
      (spot) =>
        JSON.stringify(spot.offset?.position ?? null) ===
        JSON.stringify(attachment.offset?.position ?? null),
    )?.id ?? "right";
  return (
    <section>
      <SectionHeading>Placement</SectionHeading>
      <SegmentedControl<"right" | "front" | "left">
        options={COMPANION_SPOTS.map((s) => ({ value: s.id, label: s.label }))}
        value={activeId}
        onChange={(id) =>
          setAttachmentOffset(
            "base.platform",
            COMPANION_SPOTS.find((s) => s.id === id)?.offset,
          )
        }
      />
    </section>
  );
}

function CategoryContent({ category }: { category: EditorCategory }) {
  switch (category.content.type) {
    case "parts":
      return (
        <>
          {category.content.slots.map((slot) => (
            <PartSlotSection key={slot} slot={slot} />
          ))}
          {category.id === "face" && <FaceMorphSection />}
          {category.id === "body" && (
            <>
              <ArmCountSection />
              <ProportionsSection />
            </>
          )}
        </>
      );
    case "sockets":
      return (
        <>
          <SocketSections
            sockets={category.content.sockets}
            allowNone={category.content.allowNone}
          />
          {category.id === "companion" && <CompanionPlacementSection />}
        </>
      );
    case "mixed":
      return (
        <>
          <SocketSections
            sockets={category.content.sockets}
            allowNone={category.content.allowNone}
          />
          {category.content.slots.map((slot) => (
            <PartSlotSection key={slot} slot={slot} />
          ))}
        </>
      );
    case "hands":
      return <HandsPanel />;
    case "pose":
      return <PosePanel />;
    case "materials":
      return <MaterialsPanel />;
    case "base":
      return <BasePanel />;
  }
}

export function CustomizationPanel() {
  const activeCategoryId = useUiStore((s) => s.activeCategoryId);
  const category =
    GANESHA_EDITOR_CATEGORIES.find((c) => c.id === activeCategoryId) ??
    GANESHA_EDITOR_CATEGORIES[0];
  if (!category) return null;

  return (
    <aside className="flex h-full w-80 flex-col border-l border-surface-800 bg-surface-900">
      <header className="border-b border-surface-800 px-4 py-3">
        <h2 className="font-display text-base text-stone-100">{category.label}</h2>
        <p className="text-xs text-stone-500">{category.description}</p>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <CategoryContent category={category} />
      </div>
    </aside>
  );
}
