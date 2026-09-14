/**
 * Protected characters: a structural fingerprint of the rendered scene.
 *
 * Ganesha and the production Shiva must not move while the rig is being
 * restructured beneath them. Screenshots cannot prove that — the capture
 * harness is not deterministic run to run — but the scene itself is: the
 * same configuration builds the same nodes, at the same world transforms,
 * from the same geometry, every time.
 *
 * So the fingerprint is taken over what actually reaches the renderer —
 * every node's world position, rotation and scale, and every mesh's vertex
 * count and bounds — and pinned. If an architectural change moves one
 * joint by a millimetre or swaps one generator's output, this fails, and
 * the diff says which node.
 *
 * Updating a pinned digest is a deliberate act. Do it only when the change
 * to that character is intended, and say so in the commit.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import * as THREE from "three";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

const round = (n: number): string => n.toFixed(6);

/** One line per node: what it is, where it ended up, and what it is made of. */
function sceneRows(config: CharacterConfiguration): string[] {
  const materials = new ZoneMaterials();
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);

  const rows: string[] = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  rig.root.traverse((object) => {
    object.matrixWorld.decompose(position, quaternion, scale);
    let geometry = "";
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const vertices = mesh.geometry.getAttribute("position").count;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      geometry =
        `|v${vertices}|${round(box.min.x)},${round(box.min.y)},${round(box.min.z)}` +
        `,${round(box.max.x)},${round(box.max.y)},${round(box.max.z)}`;
    }
    rows.push(
      `${object.name || object.type}` +
        `@${round(position.x)},${round(position.y)},${round(position.z)}` +
        `|${round(quaternion.x)},${round(quaternion.y)},${round(quaternion.z)},${round(quaternion.w)}` +
        `|${round(scale.x)},${round(scale.y)},${round(scale.z)}${geometry}`,
    );
  });
  materials.dispose();
  // Traversal order is an implementation detail; the set of nodes is not.
  return rows.sort();
}

function digest(rows: readonly string[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const joined = rows.join("\n");
  for (let i = 0; i < joined.length; i += 1) {
    a = Math.imul(a ^ joined.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + joined.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const PINNED = {
  // Re-pinned when the two transform pipelines became one. Ganesha's
  // hands used to be left as the pose put them while the ITEM was rotated
  // upright in world space — so an axe passed ACROSS a fist rather than
  // through it, which is precisely what references/reference_mid.png
  // objects to. Now the arm is solved onto what it holds: the shoulder
  // rotates, the forearm pronates, the wrist trims, and the fist closes
  // on a shaft whose thickness the asset declares.
  //
  // Verified before re-pinning, by capturing the same fifteen QA views
  // from the previous commit and comparing: the silhouette, ornaments,
  // garment, head, trunk and base are unchanged view for view. What moved
  // is the back hands, and they moved from beside their attributes to
  // around them.
  ganesha: { nodes: 370, digest: "ced6cadb987a4329" },
  // Shiva moved for the same reason, plus two of its own: the trishul is
  // now one fixed length that slides to meet the ground rather than a
  // shaft built to reach whatever height the hand started at, and the
  // procedural fist closes onto the radius each attribute declares.
  shiva: { nodes: 314, digest: "f59247888f3b1b30" },
} as const;

describe("protected characters do not move", () => {
  it.each([
    ["ganesha", createDefaultGaneshaConfiguration],
    ["shiva", createDefaultShivaConfiguration],
  ] as const)("%s renders exactly as it did", (name, makeConfig) => {
    const rows = sceneRows(makeConfig());
    const expected = PINNED[name];
    // Node count first: it localises "something appeared/vanished" before
    // the digest can only say "something, somewhere, differs".
    expect(rows.length, `${name} node count`).toBe(expected.nodes);
    expect(digest(rows), `${name} scene digest`).toBe(expected.digest);
  });

  it("is deterministic, so a failure means a real change", () => {
    const config = createDefaultGaneshaConfiguration();
    expect(digest(sceneRows(config))).toBe(digest(sceneRows(config)));
  });

  it("would notice a change", () => {
    // Proof the fingerprint has teeth: nudge one joint and it must move.
    const config = createDefaultGaneshaConfiguration();
    const moved = {
      ...config,
      pose: { ...config.pose, jointOverrides: { ...config.pose.jointOverrides, neck: [0.01, 0, 0] as const } },
    } as CharacterConfiguration;
    expect(digest(sceneRows(moved))).not.toBe(PINNED.ganesha.digest);
  });
});
