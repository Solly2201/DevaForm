"use client";

/**
 * Public share view — reconstructs a shared creation from its pinned
 * configuration and lets the visitor inspect it in 3D or open a copy in
 * Divine Studio.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { loadShare, type SharedCreation } from "@/lib/characterApi";
import { SiteNav } from "@/components/site/SiteNav";
import { useEditorStore } from "@/state/editorStore";

const StaticCharacterView = dynamic(
  () => import("@/engine/StaticCharacterView").then((m) => m.StaticCharacterView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Preparing the divine form…
      </div>
    ),
  },
);

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const newCharacter = useEditorStore((s) => s.newCharacter);
  const setCharacterName = useEditorStore((s) => s.setCharacterName);

  const [share, setShare] = useState<SharedCreation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadShare(id)
      .then(setShare)
      .catch((e) => setError(e instanceof Error ? e.message : "This share could not be found"));
  }, [id]);

  const openInStudio = () => {
    if (!share) return;
    newCharacter(share.config);
    setCharacterName(`${share.name} (shared)`);
    useEditorStore.temporal.getState().clear();
    // The shared creation carries its own form; the editor follows it.
    router.push("/studio");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 text-stone-200">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-10 md:px-10">
        {error && (
          <div className="mt-20 text-center">
            <p className="font-display text-2xl text-stone-300">This share could not be found.</p>
            <p className="mt-2 text-sm text-stone-500">{error}</p>
            <Link
              href="/studio"
              className="mt-6 inline-block rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-semibold text-surface-950 hover:bg-saffron-400"
            >
              Create your own
            </Link>
          </div>
        )}

        {!error && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-stone-500">
                  A shared creation
                </p>
                <h1 className="font-display text-2xl text-stone-100">
                  {share?.name ?? "Loading…"}
                </h1>
                {share && (
                  <p className="text-xs capitalize text-stone-500">
                    {share.deity} · shared {new Date(share.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={openInStudio}
                disabled={!share}
                className="rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-semibold text-surface-950 hover:bg-saffron-400 disabled:opacity-50"
              >
                Open in Divine Studio
              </button>
            </div>
            <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-surface-800 bg-surface-900">
              {share && <StaticCharacterView config={share.config} />}
              {!share && (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">
                  Loading creation…
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-[11px] text-stone-600">
              Drag to rotate · scroll to zoom — rebuilt live from the shared configuration.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
