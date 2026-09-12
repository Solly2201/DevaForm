"use client";

/**
 * Right-hand customization panel. Renders entirely from category metadata:
 * part categories get asset grids per slot, socket categories get asset
 * grids per socket, and pose/materials/base render dedicated panels.
 */
import {
  GANESHA_EDITOR_CATEGORIES,
  listAssets,
  type EditorCategory,
} from "@devaform/asset-system";
import { getSocket, type PartSlot, type SocketId } from "@devaform/character-schema";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";
import { AssetGrid } from "./AssetGrid";
import { SliderControl } from "@/components/controls/SliderControl";
import { BasePanel } from "./panels/BasePanel";
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
  lowerGarment: "Dhoti",
  upperGarment: "Upper Garment",
};

/** Slots the user may intentionally leave empty. */
const OPTIONAL_SLOTS: readonly PartSlot[] = ["upperGarment", "hair"];

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

function CategoryContent({ category }: { category: EditorCategory }) {
  switch (category.content.type) {
    case "parts":
      return (
        <>
          {category.content.slots.map((slot) => (
            <PartSlotSection key={slot} slot={slot} />
          ))}
          {category.id === "body" && <ProportionsSection />}
        </>
      );
    case "sockets":
      return (
        <>
          {category.content.sockets.map((socket) => (
            <SocketSection
              key={socket}
              socket={socket}
              allowNone={category.content.type === "sockets" && category.content.allowNone}
            />
          ))}
        </>
      );
    case "pose":
      return <PosePanel />;
    case "materials":
      return <MaterialsPanel />;
    case "base":
      return <BasePanel />;
    case "morphs":
      return <p className="text-xs text-stone-500">Morph controls arrive with sculpted assets.</p>;
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
