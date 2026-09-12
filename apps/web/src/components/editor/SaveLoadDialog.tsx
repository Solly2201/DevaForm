"use client";

/** Character library dialog: list, load and delete saved characters. */
import { useCallback, useEffect, useState } from "react";
import {
  deleteCharacter,
  listCharacters,
  loadCharacter,
  type CharacterSummary,
} from "@/lib/characterApi";
import { useEditorStore } from "@/state/editorStore";
import { useUiStore } from "@/state/uiStore";

export function SaveLoadDialog() {
  const open = useUiStore((s) => s.saveDialogOpen);
  const setOpen = useUiStore((s) => s.setSaveDialogOpen);
  const showStatus = useUiStore((s) => s.showStatus);
  const adoptLoadedCharacter = useEditorStore((s) => s.adoptLoadedCharacter);

  const [characters, setCharacters] = useState<CharacterSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setCharacters(await listCharacters());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load characters");
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const handleLoad = async (id: string) => {
    setBusyId(id);
    try {
      const loaded = await loadCharacter(id);
      adoptLoadedCharacter({ id: loaded.id, name: loaded.name, config: loaded.config });
      useEditorStore.temporal.getState().clear();
      setOpen(false);
      showStatus(`Loaded “${loaded.name}”`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load character");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteCharacter(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete character");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Character library"
      onClick={() => setOpen(false)}
    >
      <div
        className="max-h-[70vh] w-[28rem] overflow-hidden rounded-xl border border-surface-700 bg-surface-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-surface-800 px-4 py-3">
          <h2 className="font-display text-base text-stone-100">Character Library</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-stone-500 hover:text-stone-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[55vh] overflow-y-auto p-3">
          {error && <p className="mb-2 rounded-lg bg-red-950/60 px-3 py-2 text-xs text-red-300">{error}</p>}
          {characters === null && !error && (
            <p className="px-3 py-6 text-center text-xs text-stone-500">Loading…</p>
          )}
          {characters?.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-stone-500">
              No saved characters yet. Customize your Ganesha and press Save.
            </p>
          )}
          <ul className="space-y-2">
            {characters?.map((character) => (
              <li
                key={character.id}
                className="flex items-center gap-3 rounded-lg border border-surface-800 bg-surface-850 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-stone-200">{character.name}</p>
                  <p className="text-[11px] text-stone-500">
                    {character.deity} · {new Date(character.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void handleLoad(character.id)}
                  className="rounded-md bg-saffron-500 px-3 py-1 text-xs font-semibold text-surface-950 hover:bg-saffron-400 disabled:opacity-50"
                >
                  {busyId === character.id ? "…" : "Load"}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void handleDelete(character.id)}
                  className="rounded-md border border-surface-700 px-2 py-1 text-xs text-stone-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
