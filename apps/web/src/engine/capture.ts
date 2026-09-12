/**
 * Viewport capture. The editor canvas is created with
 * preserveDrawingBuffer, so the latest frame can be read directly.
 */

function findViewportCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>("main canvas");
}

/**
 * Capture the viewport, optionally downscaled so the longest edge is
 * `maxSize`. Returns a data URL, or null when no canvas is present.
 */
export function captureViewport(
  maxSize?: number,
  format: "image/png" | "image/jpeg" = "image/png",
  quality = 0.85,
): string | null {
  const canvas = findViewportCanvas();
  if (!canvas || canvas.width === 0) return null;
  if (!maxSize || Math.max(canvas.width, canvas.height) <= maxSize) {
    return canvas.toDataURL(format, quality);
  }
  const scale = maxSize / Math.max(canvas.width, canvas.height);
  const off = document.createElement("canvas");
  off.width = Math.round(canvas.width * scale);
  off.height = Math.round(canvas.height * scale);
  const ctx = off.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  return off.toDataURL(format, quality);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
