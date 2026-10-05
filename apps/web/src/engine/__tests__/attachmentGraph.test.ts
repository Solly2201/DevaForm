/**
 * EXPERIMENT — the attachment graph measured against the production path.
 *
 * Not a regression test for a shipped feature: nothing in the engine
 * imports the module under test. This is the experiment's instrument, and
 * it stays in the suite because an experiment whose numbers cannot be
 * re-run is an anecdote. See `docs/attachment-graph-experiment.md`.
 *
 * The decision rule was fixed before any of it ran: a result where the
 * graph merely reproduces what the scene graph, sockets, socket
 * refinements and `GripFrame` already provide is a FAILURE.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  interface RealLoader {
    parse(data: ArrayBuffer, path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void;
  }
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void {
        const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        this.real.parse(buffer as ArrayBuffer, "", onLoad);
      }
    },
  };
});

import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport, type CharacterRig } from "../rig";
import { ZoneMaterials } from "../materials";
import {
  describeRigAsGraph,
  resolveAttachmentGraph,
  type AttachmentNode,
} from "../experimental/attachmentGraph";

async function rigFor(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  buildRig(config, materials);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const rig = buildRig(config, materials);
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

/** A stand-in for a sub-attachment: a jewel, a bell, a finial. */
function marker(name: string): THREE.Object3D {
  const object = new THREE.Object3D();
  object.name = name;
  return object;
}

/** Where a node ended up, in world space. */
function worldOf(object: THREE.Object3D): THREE.Vector3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
}

function namedNode(rig: CharacterRig, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  rig.root.traverse((object) => {
    if (!found && object.name === `attachment:${id}`) found = object;
  });
  return found;
}

describe("what the shipped figures actually need from a graph", () => {
  /**
   * Q2, asked of production rather than of the model: does anything that
   * ships want to be the child of another attachment?
   *
   * If every built node hangs off a joint or a socket, the graph's one
   * extra capability is unused by the entire catalogue, and that is the
   * single most important number in the experiment.
   */
  it.each([
    ["ganesha", createDefaultGaneshaConfiguration],
    ["shiva", createDefaultShivaConfiguration],
    ["vishnu", createDefaultVishnuConfiguration],
  ] as const)("%s builds a tree exactly one attachment deep", async (_label, make) => {
    const { rig, materials } = await rigFor(make());
    try {
      const shape = describeRigAsGraph(rig);
      expect(shape.nodes, "the figure wears things").toBeGreaterThan(5);
      expect(
        shape.deeperThanOne,
        `assets parented to other assets: ${shape.deeperThanOne.join(", ")}`,
      ).toEqual([]);
    } finally {
      materials.dispose();
    }
  }, 300_000);
});

describe("the graph, measured against the production path", () => {
  /**
   * Q1, Q3, Q5, Q7 — and the number the decision turns on.
   *
   * The same marker is placed twice: once by the graph as a child of the
   * crown, once by the production path's own mechanism — parented to the
   * socket the crown hangs on, with the crown's local offset applied by
   * hand. Then the figure is posed, and both are measured.
   *
   * A difference of zero means the graph is CORRECT and contributes
   * nothing, because both are `Object3D.add` underneath. That is the
   * failure condition this experiment set for itself.
   */
  it("places a sub-attachment exactly where the production path would", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const crown = namedNode(rig, "vishnu.crown.kirita");
      expect(crown, "Vishnu wears his crown").toBeTruthy();

      const OFFSET: readonly [number, number, number] = [0.01, 0.06, 0.004];
      const byGraph = marker("jewel-by-graph");
      const nodes: AttachmentNode[] = [
        {
          id: "crown.jewel",
          parent: { kind: "node", id: "crown" },
          frame: { position: OFFSET },
          object: byGraph,
        },
        {
          id: "crown",
          parent: { kind: "socket", id: "head.crown" },
          // The crown's own local transform, read off the built node so
          // the two paths start from the same place.
          frame: {
            position: [crown!.position.x, crown!.position.y, crown!.position.z],
          },
          object: marker("crown"),
        },
      ];
      const result = resolveAttachmentGraph(rig, nodes);
      expect(result.unresolved, result.unresolved.join("; ")).toEqual([]);
      expect(result.depth, "the chain is two deep").toBe(2);

      // The production path: there is no node anchor, so the same result
      // has to be reached by adding the child to the crown itself.
      const byProduction = marker("jewel-by-production");
      byProduction.position.set(...OFFSET);
      crown!.add(byProduction);

      rig.root.updateWorldMatrix(true, true);
      const before = worldOf(byGraph).distanceTo(worldOf(byProduction)) * 1000;

      // Q3, Q5, Q7: pose the figure and ask again.
      poseRig(rig, { preset: "shiva.tandava", jointOverrides: {} });
      rig.root.updateWorldMatrix(true, true);
      const after = worldOf(byGraph).distanceTo(worldOf(byProduction)) * 1000;

      expect(before, `graph vs production at rest: ${before.toFixed(4)}mm`).toBeLessThan(0.001);
      expect(after, `graph vs production when posed: ${after.toFixed(4)}mm`).toBeLessThan(0.001);
    } finally {
      materials.dispose();
    }
  }, 300_000);

  /**
   * Q4, Q6 — a body morph and a different deity.
   *
   * Both are rebuilds in this engine, so the honest form of the question
   * is whether a graph authored against one figure still resolves against
   * another. It does for anchors every skeleton declares, and does not
   * for anchors only one deity has — which is the same failure the
   * production path has, reported the same way.
   */
  it("survives a deity change exactly as far as its anchors do", async () => {
    const vishnu = await rigFor(createDefaultVishnuConfiguration());
    const ganesha = await rigFor(createDefaultGaneshaConfiguration());
    try {
      const nodes = (): AttachmentNode[] => [
        {
          id: "on-the-head",
          parent: { kind: "socket", id: "head.crown" },
          frame: { position: [0, 0.02, 0] },
          object: marker("a"),
        },
        {
          id: "on-a-trunk",
          parent: { kind: "socket", id: "trunk.tip" },
          frame: { position: [0, 0, 0] },
          object: marker("b"),
        },
      ];
      const onVishnu = resolveAttachmentGraph(vishnu.rig, nodes());
      const onGanesha = resolveAttachmentGraph(ganesha.rig, nodes());

      expect(onGanesha.unresolved, "Ganesha has both anchors").toEqual([]);
      expect(
        onVishnu.unresolved.join(" "),
        "Vishnu has no trunk, and the graph says so rather than guessing",
      ).toContain("trunk.tip");
      expect(onVishnu.placed.has("on-the-head"), "the head anchor still resolves").toBe(true);
    } finally {
      vishnu.materials.dispose();
      ganesha.materials.dispose();
    }
  }, 300_000);

  /**
   * Q13 — does it introduce a second source of truth?
   *
   * The test is whether the graph can disagree with the scene. It can:
   * a node can be re-parented in the graph while the object is already a
   * child of something else, and the graph will silently move it. Nothing
   * reconciles the two, which is exactly what "a second source of truth"
   * means in practice.
   */
  it("can silently move an object that production already parented", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const crown = namedNode(rig, "vishnu.crown.kirita");
      expect(crown, "Vishnu wears his crown").toBeTruthy();
      const before = crown!.parent;
      expect(before, "production put it somewhere").toBeTruthy();

      resolveAttachmentGraph(rig, [
        {
          id: "the-crown-again",
          parent: { kind: "joint", id: "leg.left.foot" },
          frame: { position: [0, 0, 0] },
          object: crown!,
        },
      ]);
      expect(
        crown!.parent === before,
        "the graph re-parented a production-owned object without objecting",
      ).toBe(false);
    } finally {
      materials.dispose();
    }
  }, 300_000);

  /**
   * The four real cases from the proposal, and the shape they are.
   *
   * Crown/hair, garland/collar, belt/cloth, garland/garment. None of them
   * is a parent and a child: removing the crown must not remove the hair,
   * and the dhoti is not a component of the belt. Written as a plain
   * statement of the relationships so the claim in the document is in the
   * suite rather than only in prose.
   */
  it("cannot express the four cases that actually hurt, because they are siblings", async () => {
    const { rig, materials } = await rigFor(createDefaultVishnuConfiguration());
    try {
      const crown = namedNode(rig, "vishnu.crown.kirita");
      const garland = namedNode(rig, "vishnu.garland.vaijayanti");
      expect(crown && garland, "both are built").toBeTruthy();

      // A sibling pair: each hangs off the figure, neither off the other.
      let hairParent: THREE.Object3D | null = null;
      rig.root.traverse((object) => {
        if (object.name === "part:vishnu.hair.flowing") hairParent = object.parent;
      });
      expect(hairParent, "the hair is built and parented").toBeTruthy();
      expect(
        hairParent === crown,
        "the hair is NOT a child of the crown, and making it one would delete it with the crown",
      ).toBe(false);

      // What the pair actually needs is a shared line, which the product
      // already solves with a function both call.
      expect(
        crown!.parent === garland!.parent,
        "crown and garland hang from different sockets; layering is not parenting either",
      ).toBe(false);
    } finally {
      materials.dispose();
    }
  }, 300_000);
});
