"use client";

/**
 * Client entry for Divine Studio. Resolves the deity definition, makes sure
 * the editor store holds a configuration for this deity (without clobbering
 * in-progress work on the same deity), and mounts the editor inside the
 * deity context.
 */
import { useEffect, useState } from "react";
import { getAvailableDeity } from "@devaform/asset-system";
import { EditorShell } from "@/components/editor/EditorShell";
import { DeityProvider } from "@/state/deityContext";
import { useEditorStore } from "@/state/editorStore";

export function StudioClient({ deityId }: { deityId: string }) {
  const deity = getAvailableDeity(deityId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!deity) return;
    const state = useEditorStore.getState();
    if (state.config.deity !== deity.id) {
      state.newCharacter(deity.createDefaultConfiguration());
      useEditorStore.temporal.getState().clear();
    }
    setReady(true);
  }, [deity]);

  if (!deity) return null;
  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface-950 text-sm text-stone-500">
        Preparing Divine Studio…
      </div>
    );
  }

  return (
    <DeityProvider deity={deity}>
      <EditorShell />
    </DeityProvider>
  );
}
