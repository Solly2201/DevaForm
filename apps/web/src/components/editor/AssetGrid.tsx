"use client";

/**
 * Reusable asset picker grid. Consumes registry metadata only — no
 * hardcoded asset knowledge. Used for both part slots and sockets.
 */
import { useEffect, useState } from "react";
import type { AssetDefinition } from "@devaform/asset-system";
import { getAssetThumbnail } from "@/engine/thumbnails";
import { STAGE_BADGE } from "./assetBadge";

interface AssetGridProps {
  assets: readonly AssetDefinition[];
  selectedAssetId: string | null;
  /** Show a "None" tile allowing the slot/socket to be emptied. */
  allowNone?: boolean;
  /**
   * A line about THIS asset's place in the composition, shown on its
   * card — "In the Back Right Hand" for a divine attribute that is a
   * singleton and is currently presented somewhere else.
   *
   * The resolver already explains the conflict, but only once the
   * customer has created it: they choose the Trishul in a second hand,
   * the first one empties, and a sentence appears in the notices. Saying
   * it on the card says it before rather than after, which is the
   * difference between a product that is explaining itself and one that
   * is apologising.
   */
  noteFor?: (asset: AssetDefinition) => string | null;
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
  note,
  onSelect,
}: {
  asset: AssetDefinition;
  selected: boolean;
  note: string | null;
  onSelect: () => void;
}) {
  const thumbnail = useAssetThumbnail(asset.id);
  const badge = STAGE_BADGE[asset.stage];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={note ? `${note}. ${asset.description ?? asset.name}` : (asset.description ?? asset.name)}
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
        <span
          className={`block truncate text-[10px] uppercase tracking-wide ${
            note ? "text-saffron-500/90" : "text-stone-500"
          }`}
        >
          {note ?? badge ?? " "}
        </span>
      </span>
    </button>
  );
}

export function AssetGrid({
  assets,
  selectedAssetId,
  allowNone = false,
  noteFor,
  onSelect,
}: AssetGridProps) {
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
          note={noteFor?.(asset) ?? null}
          onSelect={() => onSelect(asset.id)}
        />
      ))}
    </div>
  );
}
