"use client";

import {
  MATERIAL_ZONES,
  materialFinishSchema,
  type MaterialFinish,
  type MaterialZone,
} from "@devaform/character-schema";
import { ColorControl } from "@/components/controls/ColorControl";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { useEditorStore } from "@/state/editorStore";

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

export function MaterialsPanel() {
  const materials = useEditorStore((s) => s.config.materials);
  const setZoneMaterial = useEditorStore((s) => s.setZoneMaterial);

  return (
    <div className="space-y-5">
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
