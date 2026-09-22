"use client";

/**
 * Divine Studio, the one editor.
 *
 * WHICH FORM IS CONFIGURATION, NOT A ROUTE. The Studio used to live at
 * /studio/<deity>, which made the deity the identity of the editor: a
 * customer had to choose a god before they could see the product at all,
 * and changing their mind meant finding another URL. There is one Studio
 * now, and the active form is simply the deity of the configuration it
 * is holding — chosen from inside, beside every other choice.
 *
 * The old routes still resolve; they hand the form over as `?form=` and
 * this seeds it once. Saved and shared creations carry their own deity
 * in the configuration, so opening one needs no route at all.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AVAILABLE_DEITIES, getAvailableDeity } from "@devaform/asset-system";
import { EditorShell } from "@/components/editor/EditorShell";
import { DeityProvider } from "@/state/deityContext";
import { useEditorStore } from "@/state/editorStore";

export function StudioClient() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("form");
  const configDeity = useEditorStore((s) => s.config.deity);
  const [ready, setReady] = useState(false);

  /**
   * A form asked for by a link — an old /studio/<deity> URL, or a deity
   * card on the way in.
   *
   * Honoured ONCE, and never over unsaved work: a customer who has been
   * making a Vishnu and then follows a stale Shiva link should not lose
   * it without being asked, and a link is not a place to ask. The
   * parameter is stripped either way, because the editor's address is
   * /studio.
   */
  useEffect(() => {
    const store = useEditorStore.getState();
    if (asked && asked !== store.config.deity && getAvailableDeity(asked) && !store.dirty) {
      store.switchDeity(asked);
      useEditorStore.temporal.getState().clear();
    }
    if (asked) router.replace("/studio");
    setReady(true);
  }, [asked, router]);

  const deity = getAvailableDeity(configDeity) ?? AVAILABLE_DEITIES[0];

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
