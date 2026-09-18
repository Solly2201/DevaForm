"use client";

/**
 * Asking before something is thrown away — in the product, not in the
 * browser.
 *
 * Starting a new creation over unsaved work used to call
 * `window.confirm`. That is the browser's dialog, not DevaForm's: it
 * carries the page's URL, cannot be styled, blocks the whole tab, and is
 * exactly the thing that makes an otherwise finished application feel
 * like a prototype.
 *
 * Small and modal, because that is what it is: Escape cancels, the safe
 * choice takes focus, and focus goes back where it came from.
 */
import { useEffect, useRef } from "react";

export interface Confirmation {
  title: string;
  body: string;
  /** The label on the button that goes ahead. */
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  confirmation,
  onCancel,
}: {
  confirmation: Confirmation | null;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    returnTo.current = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
    };
  }, [confirmation, onCancel]);

  if (!confirmation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-[22rem] rounded-xl border border-surface-700 bg-surface-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-display text-base text-stone-100">
          {confirmation.title}
        </h2>
        <p className="mt-2 text-sm text-stone-400">{confirmation.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 transition-colors hover:border-stone-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              confirmation.onConfirm();
              onCancel();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              confirmation.destructive
                ? "bg-red-500 text-white hover:bg-red-400"
                : "bg-saffron-500 text-surface-950 hover:bg-saffron-400"
            }`}
          >
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
