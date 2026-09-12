"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import { createCharacter, saveCharacter } from "@/lib/characterApi";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";

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
  const deity = useEditorStore((s) => s.config.deity);
  const characterName = useEditorStore((s) => s.characterName);
  const setCharacterName = useEditorStore((s) => s.setCharacterName);
  const characterId = useEditorStore((s) => s.characterId);
  const dirty = useEditorStore((s) => s.dirty);
  const markSaved = useEditorStore((s) => s.markSaved);
  const newCharacter = useEditorStore((s) => s.newCharacter);

  const temporal = useEditorStore.temporal;
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0);

  const setSaveDialogOpen = useUiStore((s) => s.setSaveDialogOpen);
  const showStatus = useUiStore((s) => s.showStatus);
  const statusMessage = useUiStore((s) => s.statusMessage);
  const clearStatus = useUiStore((s) => s.clearStatus);

  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { config } = useEditorStore.getState();
      const name = useEditorStore.getState().characterName.trim() || "Untitled";
      const result = characterId
        ? await saveCharacter(characterId, name, config)
        : await createCharacter(name, config);
      markSaved(result.id);
      showStatus("Saved");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }, [characterId, markSaved, saving, showStatus]);

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

  return (
    <header className="flex h-14 items-center gap-4 border-b border-surface-800 bg-surface-900 px-4">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-lg font-semibold tracking-wide text-saffron-500">
          DevaForm
        </span>
        <span className="text-[10px] uppercase tracking-widest text-stone-600">Divine Studio</span>
      </div>

      <div className="mx-4 h-6 w-px bg-surface-700" />

      <span
        className="rounded-full border border-surface-700 px-2.5 py-0.5 text-[11px] font-medium capitalize text-stone-400"
        title="Deity being customized"
      >
        {deity}
      </span>

      <input
        value={characterName}
        onChange={(e) => setCharacterName(e.target.value)}
        aria-label="Character name"
        className="w-56 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-200 transition-colors hover:border-surface-700 focus:border-saffron-600 focus:outline-none"
      />
      {dirty && <span className="h-2 w-2 rounded-full bg-saffron-500" title="Unsaved changes" />}

      <div className="flex-1" />

      {statusMessage && (
        <span
          className={`text-xs ${statusMessage.kind === "error" ? "text-red-400" : "text-stone-400"}`}
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
        onClick={() => {
          newCharacter();
          temporal.getState().clear();
        }}
        className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:border-stone-500"
      >
        New
      </button>
      <button
        type="button"
        onClick={() => setSaveDialogOpen(true)}
        className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:border-stone-500"
      >
        Library
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
