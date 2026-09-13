"use client";

import {
  MATERIAL_PALETTES,
  MATERIAL_ZONES,
  materialFinishSchema,
  type MaterialFinish,
  type MaterialZone,
} from "@devaform/character-schema";
import { resolveAssetRef } from "@devaform/asset-system";
import { ColorControl } from "@/components/controls/ColorControl";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { useEditorStore } from "@/state/editorStore";

/**
 * Selected parts whose appearance is baked into the asset (no declared
 * material zones on a mesh source) can't participate in recoloring —
 * derived from asset metadata, never from specific asset ids.
 */
function useBakedParts(): string[] {
  const parts = useEditorStore((s) => s.config.parts);
  return Object.values(parts)
    .map((ref) => resolveAssetRef(ref))
    .filter(
      (asset) =>
        asset !== undefined &&
        asset.source.kind === "glb" &&
        asset.materialZones.length === 0,
    )
    .map((asset) => asset!.name);
}

const ZONE_LABELS: Record<MaterialZone, string> = {
  skin: "Skin",
  skinSecondary: "Inner Ear / Accent Skin",
  garment: "Garment",
  garmentAccent: "Garment Accent",
  metal: "Metal / Jewellery",
  gem: "Gems",
  base: "Base",
};

const FINISH_OPTIONS = materialFinishSchema.options.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

function PaletteSwatch({ id }: { id: string }) {
  const palette = MATERIAL_PALETTES.find((p) => p.id === id);
  if (!palette) return null;
  const colors = [
    palette.materials.skin.color,
    palette.materials.garment.color,
    palette.materials.metal.color,
    palette.materials.gem.color,
  ];
  return (
    <span className="flex gap-0.5">
      {colors.map((c, i) => (
        <span key={i} className="h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

export function MaterialsPanel() {
  const materials = useEditorStore((s) => s.config.materials);
  const setZoneMaterial = useEditorStore((s) => s.setZoneMaterial);
  const applyPalette = useEditorStore((s) => s.applyPalette);
  const bakedParts = useBakedParts();

  return (
    <div className="space-y-5">
      {bakedParts.length > 0 && (
        <p className="rounded-lg border border-surface-800 bg-surface-850 p-2.5 text-[11px] text-stone-400">
          {bakedParts.join(", ")} uses baked textures and keeps its authored
          colors — palettes affect the rest of the statue.
        </p>
      )}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Palettes
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {MATERIAL_PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              title={palette.description}
              onClick={() => applyPalette(palette.id)}
              className="flex flex-col items-start gap-1.5 rounded-lg border border-surface-700 px-2.5 py-2 text-left transition-colors hover:border-saffron-600"
            >
              <PaletteSwatch id={palette.id} />
              <span className="text-xs font-medium text-stone-300">{palette.label}</span>
            </button>
          ))}
        </div>
      </section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        Fine-tune Zones
      </h3>
      {MATERIAL_ZONES.map((zone) => (
        <section key={zone} className="rounded-lg border border-surface-800 bg-surface-850 p-3">
          <ColorControl
            label={ZONE_LABELS[zone]}
            value={materials[zone].color}
            onChange={(color) => setZoneMaterial(zone, { color })}
          />
          <div className="mt-2">
            <SegmentedControl<MaterialFinish>
              options={FINISH_OPTIONS}
              value={materials[zone].finish}
              onChange={(finish) => setZoneMaterial(zone, { finish })}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
