"use client";

/**
 * Creation library — the home of everything the user has made.
 * Open loads a creation into Divine Studio; duplicate creates an
 * independent copy; rename edits in place; delete removes it.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  loadCharacter,
  renameCharacter,
  type CharacterSummary,
} from "@/lib/characterApi";
import { ConfirmDialog, type Confirmation } from "@/components/editor/ConfirmDialog";
import { SiteNav } from "@/components/site/SiteNav";
import { useEditorStore } from "@/state/editorStore";

function CreationCard({
  creation,
  busy,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  creation: CharacterSummary;
  busy: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(creation.name);

  const commitRename = () => {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== creation.name) onRename(name);
    else setDraft(creation.name);
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 transition-colors hover:border-surface-700">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-surface-850 text-left"
        aria-label={`Open ${creation.name}`}
      >
        {creation.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview
          <img
            src={creation.preview}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-stone-600">
            No preview yet
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraft(creation.name);
                setRenaming(false);
              }
            }}
            className="rounded-md border border-saffron-600 bg-surface-850 px-2 py-1 text-sm text-stone-100 focus:outline-none"
            aria-label="Creation name"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="truncate text-left text-sm font-medium text-stone-200 hover:text-saffron-400"
            title="Rename"
          >
            {creation.name}
          </button>
        )}
        <p className="text-[11px] capitalize text-stone-500">
          {creation.deity} · {new Date(creation.updatedAt).toLocaleDateString()}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onOpen}
            disabled={busy}
            className="rounded-md bg-saffron-500 px-3 py-1 text-xs font-semibold text-surface-950 hover:bg-saffron-400 disabled:opacity-50"
          >
            Open
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={busy}
            className="rounded-md border border-surface-700 px-2.5 py-1 text-xs text-stone-400 hover:border-stone-500 disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-md border border-surface-700 px-2.5 py-1 text-xs text-stone-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const adoptLoadedCharacter = useEditorStore((s) => s.adoptLoadedCharacter);
  const [creations, setCreations] = useState<CharacterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setCreations(await listCharacters());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your library");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const handleOpen = (creation: CharacterSummary) =>
    withBusy(creation.id, async () => {
      const loaded = await loadCharacter(creation.id);
      adoptLoadedCharacter({ id: loaded.id, name: loaded.name, config: loaded.config });
      useEditorStore.temporal.getState().clear();
      // The creation carries its own form; the editor follows it.
      router.push("/studio");
    });

  const handleDuplicate = (creation: CharacterSummary) =>
    withBusy(creation.id, async () => {
      const loaded = await loadCharacter(creation.id);
      await createCharacter(`${loaded.name} (copy)`, loaded.config, creation.preview ?? undefined);
      await refresh();
    });

  /**
   * Deleting asks in the product, not in the browser.
   *
   * `window.confirm` carries the page's URL in its title, cannot be
   * styled, and blocks the whole tab — the same reason the Studio stopped
   * using it for New.
   */
  const handleDelete = (creation: CharacterSummary) =>
    setConfirmation({
      title: "Delete this creation?",
      body: `“${creation.name}” will be removed from your library. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () =>
        void withBusy(creation.id, async () => {
          await deleteCharacter(creation.id);
          await refresh();
        }),
    });

  const handleRename = (creation: CharacterSummary, name: string) =>
    withBusy(creation.id, async () => {
      await renameCharacter(creation.id, name);
      await refresh();
    });

  return (
    <div className="min-h-dvh bg-surface-950 text-stone-200">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-stone-100">Your Library</h1>
            <p className="mt-1 text-sm text-stone-400">Every divine form you have created.</p>
          </div>
          <Link
            href="/deities"
            className="rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-semibold text-surface-950 hover:bg-saffron-400"
          >
            New Creation
          </Link>
        </div>

        {error && (
          <p className="mt-6 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</p>
        )}

        {creations === null && !error && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-surface-900" />
            ))}
          </div>
        )}

        {creations?.length === 0 && (
          <div className="mt-16 flex flex-col items-center rounded-2xl border border-dashed border-surface-700 py-16 text-center">
            <p className="font-display text-xl text-stone-300">
              Your divine creations will appear here.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Enter Divine Studio and shape your first form.
            </p>
            <Link
              href="/studio"
              className="mt-6 rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-semibold text-surface-950 hover:bg-saffron-400"
            >
              Create your first Ganesha
            </Link>
          </div>
        )}

        {creations && creations.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creations.map((creation) => (
              <CreationCard
                key={creation.id}
                creation={creation}
                busy={busyId === creation.id}
                onOpen={() => void handleOpen(creation)}
                onRename={(name) => void handleRename(creation, name)}
                onDuplicate={() => void handleDuplicate(creation)}
                onDelete={() => void handleDelete(creation)}
              />
            ))}
          </div>
        )}
      </main>
      <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
    </div>
  );
}
