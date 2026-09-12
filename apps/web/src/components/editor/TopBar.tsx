"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { captureViewport } from "@/engine/capture";
import { createCharacter, createShare, saveCharacter } from "@/lib/characterApi";
import { useDeity } from "@/state/deityContext";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";

const AUTOSAVE_DELAY_MS = 15_000;

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-surface-700 p-1.5 text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function TopBar() {
  const deity = useDeity();
  const characterName = useEditorStore((s) => s.characterName);
  const setCharacterName = useEditorStore((s) => s.setCharacterName);
  const characterId = useEditorStore((s) => s.characterId);
  const dirty = useEditorStore((s) => s.dirty);
  const markSaved = useEditorStore((s) => s.markSaved);
  const newCharacter = useEditorStore((s) => s.newCharacter);

  const temporal = useEditorStore.temporal;
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0);

  const setExportDialogOpen = useUiStore((s) => s.setExportDialogOpen);
  const showStatus = useUiStore((s) => s.showStatus);
  const statusMessage = useUiStore((s) => s.statusMessage);
  const clearStatus = useUiStore((s) => s.clearStatus);

  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const handleSave = useCallback(
    async (options?: { silent?: boolean }): Promise<string | null> => {
      if (saving) return null;
      setSaving(true);
      try {
        const { config, characterId: id } = useEditorStore.getState();
        const name = useEditorStore.getState().characterName.trim() || "Untitled";
        const preview = captureViewport(320, "image/jpeg", 0.8) ?? undefined;
        const result = id
          ? await saveCharacter(id, name, config, preview)
          : await createCharacter(name, config, preview);
        markSaved(result.id);
        setSaveFailed(false);
        if (!options?.silent) showStatus("Saved");
        return result.id;
      } catch (error) {
        setSaveFailed(true);
        showStatus(error instanceof Error ? error.message : "Save failed", "error");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [markSaved, saving, showStatus],
  );

  // Autosave: once a creation exists, quietly persist changes after a pause.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || !characterId || saving) return;
    autosaveTimer.current = setTimeout(() => void handleSave({ silent: true }), AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, characterId, saving, handleSave]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      let id = useEditorStore.getState().characterId;
      if (!id || useEditorStore.getState().dirty) {
        id = await handleSave({ silent: true });
      }
      if (!id) return;
      const share = await createShare(id);
      const url = `${window.location.origin}/share/${share.id}`;
      try {
        await navigator.clipboard.writeText(url);
        showStatus("Share link copied to clipboard");
      } catch {
        showStatus(`Share link: ${url}`);
      }
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Sharing failed", "error");
    } finally {
      setSharing(false);
    }
  }, [handleSave, sharing, showStatus]);

  const handleNew = useCallback(() => {
    if (useEditorStore.getState().dirty) {
      const proceed = window.confirm(
        "You have unsaved changes. Start a new creation anyway?",
      );
      if (!proceed) return;
    }
    newCharacter(deity.createDefaultConfiguration());
    temporal.getState().clear();
    showStatus("New creation started");
  }, [deity, newCharacter, showStatus, temporal]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void handleSave();
      } else if (!inInput && key === "z" && !e.shiftKey) {
        e.preventDefault();
        temporal.getState().undo();
      } else if (!inInput && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        temporal.getState().redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, temporal]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(clearStatus, 3500);
    return () => clearTimeout(timer);
  }, [statusMessage, clearStatus]);

  const saveState = saving
    ? "Saving…"
    : saveFailed
      ? "Save failed"
      : dirty
        ? "Unsaved changes"
        : characterId
          ? "Saved"
          : "";

  return (
    <header className="flex h-14 items-center gap-3 border-b border-surface-800 bg-surface-900 px-4">
      <Link href="/" className="flex items-baseline gap-1.5">
        <span className="font-display text-lg font-semibold tracking-wide text-saffron-500">
          DevaForm
        </span>
        <span className="hidden text-[10px] uppercase tracking-widest text-stone-600 lg:inline">
          Divine Studio
        </span>
      </Link>

      <div className="mx-2 h-6 w-px bg-surface-700" />

      <Link
        href="/deities"
        className="rounded-full border border-surface-700 px-2.5 py-0.5 text-[11px] font-medium text-stone-400 transition-colors hover:border-saffron-600 hover:text-saffron-400"
        title="Change deity"
      >
        {deity.name}
      </Link>

      <input
        value={characterName}
        onChange={(e) => setCharacterName(e.target.value)}
        aria-label="Creation name"
        className="w-28 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-200 transition-colors hover:border-surface-700 focus:border-saffron-600 focus:outline-none lg:w-48"
      />
      <span
        className={`hidden text-[11px] md:inline ${
          saveFailed ? "text-red-400" : dirty || saving ? "text-stone-500" : "text-stone-600"
        }`}
        aria-live="polite"
      >
        {saveState}
      </span>

      <div className="flex-1" />

      {statusMessage && (
        <span
          className={`hidden max-w-72 truncate text-xs md:inline ${
            statusMessage.kind === "error" ? "text-red-400" : "text-stone-400"
          }`}
        >
          {statusMessage.text}
        </span>
      )}

      <IconButton label="Undo (Ctrl+Z)" onClick={() => temporal.getState().undo()} disabled={!canUndo}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </IconButton>
      <IconButton label="Redo (Ctrl+Y)" onClick={() => temporal.getState().redo()} disabled={!canRedo}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 14l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 9H10a6 6 0 0 0 0 12h3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </IconButton>

      <div className="mx-1 h-6 w-px bg-surface-700" />

      <button
        type="button"
        onClick={handleNew}
        className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:border-stone-500"
      >
        New
      </button>
      <Link
        href="/library"
        className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:border-stone-500"
      >
        Library
      </Link>
      <button
        type="button"
        onClick={() => setExportDialogOpen(true)}
        className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:border-stone-500"
      >
        Export
      </button>
      <button
        type="button"
        onClick={() => void handleShare()}
        disabled={sharing}
        className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:border-stone-500 disabled:opacity-50"
      >
        {sharing ? "Sharing…" : "Share"}
      </button>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="rounded-lg bg-saffron-500 px-4 py-1.5 text-xs font-semibold text-surface-950 transition-colors hover:bg-saffron-400 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </header>
  );
}
