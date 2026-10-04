/**
 * Switching forms never shows a half-built one.
 *
 * Two mechanisms carry that promise and neither is visible in a
 * screenshot, which is why they are pinned here.
 *
 * FIRST, the rig is not built until the files it needs have settled. The
 * old behaviour built immediately, omitted whatever had not arrived, and
 * rebuilt when it did — so a figure genuinely could be on screen without
 * its head, and reliably WAS built twice. `glbPathsFor` is the list the
 * build waits on; what matters about it is that it is complete, because
 * anything it misses is something that can appear late.
 *
 * SECOND, the stage veils while a new form is prepared, and the veil is
 * tied to there being a finished statue rather than to a timer. The
 * subtle part is that the OLD figure is still in the scene for a frame or
 * two after the configuration changes, so "wait until a character is
 * ready" would be satisfied instantly by the character being replaced.
 *
 * The visual half of the claim is verified in the browser, where a sweep
 * watches for a rig with outstanding assets becoming visible with no veil
 * over it (screenshots/switch).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));

import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { getAsset } from "@devaform/asset-system";
import { glbPathsFor } from "../assetReadiness";
import { useStageStore } from "@/presentation/stageStore";

const DEITIES: Array<[string, () => CharacterConfiguration]> = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
];

describe("what a form needs before it can be built", () => {
  for (const [label, make] of DEITIES) {
    it(`${label}: every GLB the configuration references is waited for`, () => {
      const config = make();
      const waited = new Set(glbPathsFor(config));

      // The independent answer: walk the configuration and ask each asset
      // what it is made of. If these two ever disagree, something can
      // arrive after the statue is already on screen.
      const expected = new Set<string>();
      const refs = [
        ...Object.values(config.parts),
        ...config.attachments.map((attachment) => attachment.asset),
      ];
      for (const ref of refs) {
        if (!ref) continue;
        const source = getAsset(ref.assetId)?.source;
        if (source?.kind === "glb") expected.add(source.path);
      }

      expect(waited).toEqual(expected);
      expect([...waited].every((path) => path.endsWith(".glb"))).toBe(true);
    });
  }

  it("a deity whose body is a mesh waits for at least one file", () => {
    // Shiva and Vishnu are measured human meshes; if this ever reported
    // nothing to wait for, the gate would be open and the defect back.
    expect(glbPathsFor(createDefaultShivaConfiguration()).length).toBeGreaterThan(0);
    expect(glbPathsFor(createDefaultVishnuConfiguration()).length).toBeGreaterThan(0);
  });

  it("the same configuration always asks for the same files", () => {
    expect(glbPathsFor(createDefaultVishnuConfiguration())).toEqual(
      glbPathsFor(createDefaultVishnuConfiguration()),
    );
  });
});

describe("the stage veils while a form is prepared", () => {
  it("raising the veil says at once that there is no character", () => {
    const store = useStageStore.getState();
    store.setCharacterReady(true);
    expect(useStageStore.getState().characterReady).toBe(true);

    useStageStore.getState().beginArrival("Vishnu");
    const during = useStageStore.getState();
    expect(during.arriving).toBe("Vishnu");
    // The old figure is still in the scene for a frame or two; counting
    // it would lift the veil before anything had changed.
    expect(during.characterReady).toBe(false);
  });

  it("and the veil is the stage's, not the entry's", () => {
    // They are different waits and must not be able to cancel each other:
    // the entry happens once per visit, this happens whenever a customer
    // changes their mind.
    useStageStore.getState().finishSettle();
    useStageStore.getState().beginArrival("Shiva");
    expect(useStageStore.getState().phase).toBe("ready");
    expect(useStageStore.getState().arriving).toBe("Shiva");

    useStageStore.getState().finishArrival();
    expect(useStageStore.getState().arriving).toBeNull();
    expect(useStageStore.getState().phase).toBe("ready");
  });
});
