"use client";

/**
 * What just happened, where the customer is looking.
 *
 * Feedback used to be a line of text in the top bar, hidden below a
 * medium window (`hidden md:inline`) and truncated at eighteen
 * characters. On a narrow desktop, saving, sharing and exporting all
 * reported success to nobody; and when the clipboard was unavailable the
 * share link itself was the message, so the one thing the customer
 * actually needed was the part that got cut off.
 *
 * So it is a toast, over the stage, at a size that fits what it has to
 * say — and when the message carries a link, the link is selectable and
 * has a button of its own rather than being read out and lost.
 */
import { useEffect, useRef, useState } from "react";
import { useUiStore } from "@/state/uiStore";

export function StatusToast() {
  const status = useUiStore((s) => s.statusMessage);
  const clearStatus = useUiStore((s) => s.clearStatus);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCopied(false);
    if (!status) return;
    // A message with something to copy stays until it is dismissed: it is
    // the only copy of a share link the customer has.
    if (status.link) return;
    const timer = setTimeout(clearStatus, status.kind === "error" ? 6000 : 3200);
    return () => clearTimeout(timer);
  }, [status, clearStatus]);

  if (!status) return null;
  const error = status.kind === "error";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4"
      role="status"
      aria-live={error ? "assertive" : "polite"}
    >
      <div
        className={`pointer-events-auto flex max-w-[min(34rem,90vw)] items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur ${
          error
            ? "border-red-500/50 bg-red-950/85 text-red-200"
            : "border-saffron-600/40 bg-surface-900/90 text-stone-200"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${error ? "bg-red-400" : "bg-saffron-500"}`}
        />
        <span className="min-w-0 flex-1">{status.text}</span>
        {status.link && (
          <>
            <input
              ref={linkRef}
              readOnly
              value={status.link}
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
              className="w-44 shrink-0 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-stone-300"
            />
            <button
              type="button"
              onClick={() => {
                linkRef.current?.select();
                void navigator.clipboard
                  ?.writeText(status.link!)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className="shrink-0 rounded-md border border-surface-700 px-2 py-1 text-xs text-stone-300 transition-colors hover:border-saffron-600 hover:text-saffron-400"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={clearStatus}
          aria-label="Dismiss"
          className="shrink-0 rounded-md px-1.5 text-stone-500 transition-colors hover:text-stone-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
