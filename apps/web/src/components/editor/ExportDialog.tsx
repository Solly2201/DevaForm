"use client";

/**
 * Export & order preview dialog.
 *
 * Real, working exports: Studio render (PNG), configuration (JSON), and a
 * posed STL of the assembled statue. The printability panel reports only
 * checks that actually run; watertight/thin-wall validation is honestly
 * marked as pending the manufacturing pipeline. The order section is a
 * preview of the eventual commerce flow — checkout requires payment
 * integration and is labeled as such.
 */
import { useMemo, useState } from "react";
import {
  MANUFACTURING_MATERIALS,
  STATUE_SIZES,
  serializeConfiguration,
  type ManufacturingMaterialId,
  type StatueSizeId,
} from "@devaform/character-schema";
import { captureViewport, downloadBlob, downloadDataUrl } from "@/engine/capture";
import { analyzeRigForPrint, exportRigStl, type PrintAnalysis } from "@/engine/printExport";
import { activeRig } from "@/engine/rigHandle";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";


const CHECK_ICONS = { pass: "✓", warn: "⚠", unvalidated: "…" } as const;
const CHECK_COLORS = {
  pass: "text-emerald-400",
  warn: "text-amber-400",
  unvalidated: "text-stone-500",
} as const;

export function ExportDialog() {
  const open = useUiStore((s) => s.exportDialogOpen);
  const setOpen = useUiStore((s) => s.setExportDialogOpen);
  const showStatus = useUiStore((s) => s.showStatus);
  const characterName = useEditorStore((s) => s.characterName);

  const [sizeId, setSizeId] = useState<StatueSizeId>("s23");
  const [materialId, setMaterialId] = useState<ManufacturingMaterialId>("resin");

  const size =
    STATUE_SIZES.find((s) => s.id === sizeId) ?? (STATUE_SIZES[0] as (typeof STATUE_SIZES)[number]);
  const material =
    MANUFACTURING_MATERIALS.find((m) => m.id === materialId) ??
    (MANUFACTURING_MATERIALS[0] as (typeof MANUFACTURING_MATERIALS)[number]);

  const analysis: PrintAnalysis | null = useMemo(() => {
    if (!open || !activeRig.current) return null;
    return analyzeRigForPrint(activeRig.current, size.heightMm);
  }, [open, size.heightMm]);

  if (!open) return null;

  const fileStem = characterName.trim().replace(/[^\w-]+/g, "-").toLowerCase() || "creation";

  const handleRender = () => {
    const dataUrl = captureViewport(undefined, "image/png");
    if (!dataUrl) return showStatus("Viewport not ready", "error");
    downloadDataUrl(dataUrl, `${fileStem}-render.png`);
    showStatus("Render downloaded");
  };

  const handleConfig = () => {
    const { config } = useEditorStore.getState();
    const blob = new Blob([serializeConfiguration(config)], { type: "application/json" });
    downloadBlob(blob, `${fileStem}-configuration.json`);
    showStatus("Configuration downloaded");
  };

  const handleStl = () => {
    if (!activeRig.current) return showStatus("Viewport not ready", "error");
    downloadBlob(exportRigStl(activeRig.current), `${fileStem}.stl`);
    showStatus("STL downloaded");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export and order preview"
      onClick={() => setOpen(false)}
    >
      <div
        className="max-h-[85vh] w-[34rem] overflow-y-auto rounded-xl border border-surface-700 bg-surface-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-surface-800 px-5 py-3">
          <h2 className="font-display text-lg text-stone-100">Export &amp; Order Preview</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-500 hover:text-stone-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="space-y-6 px-5 py-4">
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Downloads
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={handleRender} className="rounded-lg border border-surface-700 px-2 py-2.5 text-xs font-medium text-stone-300 hover:border-saffron-600">
                Studio Render
                <span className="mt-0.5 block text-[10px] text-stone-500">PNG image</span>
              </button>
              <button type="button" onClick={handleConfig} className="rounded-lg border border-surface-700 px-2 py-2.5 text-xs font-medium text-stone-300 hover:border-saffron-600">
                Configuration
                <span className="mt-0.5 block text-[10px] text-stone-500">JSON</span>
              </button>
              <button type="button" onClick={handleStl} className="rounded-lg border border-surface-700 px-2 py-2.5 text-xs font-medium text-stone-300 hover:border-saffron-600">
                3D Model
                <span className="mt-0.5 block text-[10px] text-stone-500">Posed STL</span>
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Statue Size
            </h3>
            <SegmentedControl
              options={STATUE_SIZES.map((s) => ({ value: s.id, label: s.label }))}
              value={sizeId}
              onChange={setSizeId}
            />
            {analysis && (
              <p className="mt-2 text-xs text-stone-400">
                {analysis.widthMm.toFixed(0)} × {analysis.heightMm.toFixed(0)} ×{" "}
                {analysis.depthMm.toFixed(0)} mm · {analysis.triangles.toLocaleString()}{" "}
                triangles · {analysis.meshCount} components
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Material
            </h3>
            <SegmentedControl
              options={MANUFACTURING_MATERIALS.map((m) => ({ value: m.id, label: m.label }))}
              value={materialId}
              onChange={setMaterialId}
            />
            <p className="mt-2 text-xs text-stone-500">{material.description}</p>
          </section>

          {analysis && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Printability
              </h3>
              <ul className="space-y-1.5">
                {analysis.checks.map((check) => (
                  <li key={check.label} className="flex gap-2 text-xs">
                    <span className={CHECK_COLORS[check.status]}>{CHECK_ICONS[check.status]}</span>
                    <span className="text-stone-300">{check.label}</span>
                    <span className="text-stone-500">— {check.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-surface-800 bg-surface-850 p-3">
            <p className="text-xs text-stone-400">
              Ordering the physical statue ({size.label}, {material.label}) will be available
              once manufacturing and payment integration are configured. Your saved
              configuration and its exact asset versions already contain everything needed to
              reproduce this piece.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
