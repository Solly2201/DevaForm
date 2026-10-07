/**
 * A GLB is fetched once, however many parts of the Studio want it.
 *
 * The thumbnail renderer had a GLTFLoader of its own, with a cache of its
 * own, so an asset that the figure WEARS and that also has a card in the
 * picker was downloaded twice. Measured on the production build, the
 * Studio's first load fetched Ganesha's sculpted head — 1271 kB — at
 * 2.6 s to build the rig and again at 6.4 s to draw a 160-pixel picture of
 * it, because the Studio opens on the Head category and that is the first
 * card in it. A fifth of the whole first-load transfer, for nothing.
 *
 * Nothing could have caught that from inside: both loaders worked, both
 * caches worked, and every test passed. What was wrong was that there
 * were two of them. So this counts loads, which is the only question
 * worth asking here, and asks it through the two doors the module offers:
 * the synchronous one the rig uses and the awaited one the thumbnails
 * use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/** How many times anything asked the network for a file. */
let loads: string[] = [];

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(
      path: string,
      onLoad: (gltf: { scene: THREE.Group }) => void,
      _progress?: unknown,
      onError?: (error: unknown) => void,
    ): void {
      loads.push(path);
      if (path.includes("missing")) {
        setTimeout(() => onError?.(new Error("404")), 0);
        return;
      }
      const scene = new THREE.Group();
      scene.name = path;
      // Asynchronously, as a real load is: the point of the cache is what
      // happens to a second asker while the first is still in flight.
      setTimeout(() => onLoad({ scene }), 0);
    }
  },
}));

/** A fresh module, because the cache it holds is the thing under test. */
async function freshCache() {
  vi.resetModules();
  return import("../glbCache");
}

const PATH = "/assets/foundations/heads/ganesha-sculpted/1/model.glb";
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

beforeEach(() => {
  loads = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("one file, one fetch", () => {
  it("the rig asking twice fetches once", async () => {
    const { getGlb } = await freshCache();
    expect(getGlb(PATH).status).toBe("loading");
    expect(getGlb(PATH).status).toBe("loading");
    await settle();
    expect(getGlb(PATH).status).toBe("loaded");
    expect(loads).toEqual([PATH]);
  });

  /**
   * THE ONE THAT WAS WRONG. The rig starts the load synchronously and the
   * thumbnail awaits it; before they shared a cache these were two
   * downloads of the same megabyte, milliseconds apart.
   */
  it("the thumbnail renderer joins a load the rig has already started", async () => {
    const { getGlb, loadGlbScene } = await freshCache();
    getGlb(PATH);
    const scene = await loadGlbScene(PATH);
    expect(scene.name).toBe(PATH);
    expect(loads).toEqual([PATH]);
  });

  it("and the rig joins one the thumbnail renderer started", async () => {
    const { getGlb, loadGlbScene } = await freshCache();
    const awaited = loadGlbScene(PATH);
    expect(getGlb(PATH).status).toBe("loading");
    await awaited;
    expect(getGlb(PATH).status).toBe("loaded");
    expect(loads).toEqual([PATH]);
  });

  it("a file already loaded is handed straight back", async () => {
    const { loadGlbScene } = await freshCache();
    await loadGlbScene(PATH);
    await loadGlbScene(PATH);
    expect(loads).toEqual([PATH]);
  });

  /**
   * A dropped connection is not a verdict. The failure is remembered as a
   * failure — the rig must not spin — but the in-flight promise is not,
   * so a customer who comes back to the asset gets another attempt rather
   * than the same rejection for the rest of the session.
   */
  it("a failed load is attempted again, not remembered for ever", async () => {
    const { loadGlbScene, getGlb } = await freshCache();
    const missing = "/assets/missing/1/model.glb";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(loadGlbScene(missing)).rejects.toThrow();
    expect(getGlb(missing).status).toBe("error");
    await expect(loadGlbScene(missing)).rejects.toThrow();
    expect(loads).toEqual([missing, missing]);
  });
});
