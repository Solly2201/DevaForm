"use client";

/**
 * Reusable asset picker grid. Consumes registry metadata only — no
 * hardcoded asset knowledge. Used for both part slots and sockets.
 */
import { useEffect, useState } from "react";
import type { AssetDefinition, AssetStage } from "@devaform/asset-system";
import { getAssetThumbnail } from "@/engine/thumbnails";

/**
 * What a customer should be told about an asset's lifecycle — which is
 * almost nothing.
 *
 * The card used to print the stage verbatim: "prototype", "integration",
 * "experimental". Those are the pipeline's words for how far a piece has
 * got through OUR process, and putting them in a picker tells a customer
 * something about us instead of something about the statue. What they
 * actually need to know is whether a piece is finished work or something
 * still being made ready.
 */
const STAGE_BADGE: Partial<Record<AssetStage, string>> = {
  prototype: "In preparation",
  experimental: "In preparation",
  integration: "In preparation",
  review: "New",
};

interface AssetGridProps {
  assets: readonly AssetDefinition[];
  selectedAssetId: string | null;
  /** Show a "None" tile allowing the slot/socket to be emptied. */
  allowNone?: boolean;
  onSelect: (assetId: string | null) => void;
}

function useAssetThumbnail(assetId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAssetThumbnail(assetId).then((result) => {
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  return url;
}

function AssetCard({
  asset,
  selected,
  onSelect,
}: {
  asset: AssetDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const thumbnail = useAssetThumbnail(asset.id);
  const badge = STAGE_BADGE[asset.stage];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={asset.description ?? asset.name}
      className={`group flex flex-col items-stretch overflow-hidden rounded-lg border text-left transition-colors ${
        selected
          ? "border-saffron-500 bg-surface-700"
          : "border-surface-700 bg-surface-850 hover:border-stone-500"
      }`}
    >
      <span className="flex h-28 items-center justify-center bg-gradient-to-b from-surface-800 to-surface-900">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
          <img src={thumbnail} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <span className="h-8 w-8 animate-pulse rounded-md bg-surface-700" aria-hidden />
        )}
      </span>
      <span className="px-2 py-1.5">
        <span className="block truncate text-xs font-medium text-stone-200">{asset.name}</span>
        <span className="block text-[10px] uppercase tracking-wide text-stone-500">
          {badge ?? " "}
        </span>
      </span>
    </button>
  );
}

export function AssetGrid({ assets, selectedAssetId, allowNone = false, onSelect }: AssetGridProps) {
  // An empty grid is a customer wondering whether the panel is broken.
  if (assets.length === 0 && !allowNone) {
    return (
      <p className="rounded-lg border border-dashed border-surface-700 px-3 py-6 text-center text-xs text-stone-500">
        Nothing to choose here yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {allowNone && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedAssetId === null}
          className={`flex h-full min-h-[5.5rem] flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
            selectedAssetId === null
              ? "border-saffron-500 bg-surface-700 text-stone-200"
              : "border-dashed border-surface-700 text-stone-500 hover:border-stone-500"
          }`}
        >
          None
        </button>
      )}
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={asset.id === selectedAssetId}
          onSelect={() => onSelect(asset.id)}
        />
      ))}
    </div>
  );
}
