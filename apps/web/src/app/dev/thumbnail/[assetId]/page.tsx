"use client";

/**
 * Internal thumbnail capture surface. Renders one asset's deterministic
 * studio thumbnail and exposes the data URL on `window.__devaformThumb`
 * for scripts/generate-thumbnails.mjs (puppeteer) to save.
 */
import { use, useEffect, useState } from "react";
import { getAssetThumbnail } from "@/engine/thumbnails";

export default function ThumbnailCapturePage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void getAssetThumbnail(assetId).then((url) => {
      const w = window as unknown as Record<string, unknown>;
      if (url) {
        w.__devaformThumb = url;
        setThumb(url);
      } else {
        w.__devaformThumb = "FAILED";
        setFailed(true);
      }
    });
  }, [assetId]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-950">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- capture surface
        <img src={thumb} alt={assetId} width={320} height={320} />
      ) : (
        <p className="text-xs text-stone-500">
          {failed ? `Failed to render ${assetId}` : `Rendering ${assetId}…`}
        </p>
      )}
    </div>
  );
}
