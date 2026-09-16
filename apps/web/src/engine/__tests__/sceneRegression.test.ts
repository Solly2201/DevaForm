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
  // One node more than before, and it is an EMPTY one: the chest.mala
  // socket, added so a torque at the throat and a mala on the chest can be
  // worn together. Verified by removing the socket and re-running: with it
  // gone the digest is byte-for-byte the previous ced6cadb987a4329, so
  // nothing else about Ganesha moved.
  //
  // Moved again, by thirteen millimetres straight down, when the figure
  // stopped being placed by an authored root offset and started resting
  // on its base: Ganesha's soles had been hovering that far above the
  // lotus seat. Same node count, same everything else — the whole statue
  // is one translation lower. See support.test.ts, which now holds every
  // pose of both deities to actual contact.
  ganesha: { nodes: 371, digest: "8aafabab8d6e2991" },
  // Shiva moved for the same reason, plus two of its own: the trishul is
  // now one fixed length that slides to meet the ground rather than a
  // shaft built to reach whatever height the hand started at, and the
  // procedural fist closes onto the radius each attribute declares.
  // Shiva is a different statue now, deliberately. The default body is the
  // measured human mesh rather than a primitive assembly, so the stylised
  // head, eyes and hands parts are gone (the mesh has its own), the
  // garment is the layered dhoti-and-hide, the jata flows, and the naga
  // and rudraksha are both worn. Judged against references/ref3.png; the
  // QA sheet is screenshots/shiva.
  //
  // The node count DROPS because a skinned mesh is one node where the
  // primitive figure was two hundred.
  //
  // Re-pinned again after the garment was rebuilt: the hide is ONE closed
  // skin instead of a tube plus a sheet plus two leg wraps, the sash end
  // is a pleat of the cascade rather than a flat panel of its own, and
  // the dhoti is cut to the body's measured leg envelope — which the
  // engine was not passing to the profile at all, so every wrap had been
  // sized from mean limb radii. Fourteen nodes more than the count above,
  // all of them the pieces the hide split into. Judged against
  // references/ref3.png; the QA sheet is screenshots/shiva.
  //
  // The digest moved once more, at the same node count, when the sash end
  // became a ribbon whose spine is read off the column at every height: a
  // lofted tube carries one x for its whole length, and the cloth it
  // hangs on is not the same width at the waist as at the thigh.
  //
  // Two nodes more, and a new digest, for the serpent. Its head was one
  // swept form with a six-stage profile ladder, and a sweep carries its
  // own idea of which way is up: the skull came out as a flat paddle
  // lying across the throat with its mouth on top of its head. A head is
  // a hood, a skull, a snout and two eyes, each with a place relative to
  // the others, so it is built that way now in a frame that is aimed
  // once. The body is thinner, tapers along its whole length, and carries
  // counter-shading taken from which way its skin faces.
  //
  // Fifty-three nodes more, for hair and for a serpent's head. The jata
  // was eighteen locks three tenths of a skull-radius thick — eighteen
  // rods five centimetres across, which is what every look at this head
  // called them — and is forty-six a quarter that thickness now, with a
  // fringe along the hairline. The serpent's head is a hood, a skull, a
  // snout, two eyes and a stone rather than one swept form. The ash on
  // the brow is drawn in two strokes a side, parted round the third eye.
  //
  // Same nodes, new digest: what each hand holds moved onto the palm. The
  // grip point the body measures is the middle of the tube a fist makes,
  // a third of a finger's length off the knuckles, and an object centred
  // there is pinched in the fingertips with daylight behind it. The body
  // ships the SEAT now — the skin over its knuckles and the way its
  // fingers close — and an object of radius r rests at seat + normal × r.
  //
  // And again for the cloth: the pleat beside the sash had no colour
  // attribute under a material that renders them, so it rendered BLACK —
  // a hole cut through the dhoti in every three-quarter view. Every cloth
  // piece carries vertex colours now, and vertexColours.test.ts holds
  // every mesh of every pose of both deities to that.
  //
  // Six nodes more, for a damaru whose waist is long enough to be held —
  // eighteen millimetres of straight is gripped by fingers that span
  // thirty, so the outer two ran into the flare. And a new digest for
  // three measurements the body got right this time: the radius that
  // CONTAINS a limb rather than its mean (a bangle no longer sunk in a
  // forearm), the hips centred where the body actually is rather than on
  // the pelvis joint, and a torso surface that carries per-morph deltas.
  //
  // And once more for the cloth: the dhoti follows the leg in below the
  // knee instead of standing the same distance off it all the way down,
  // which is what made the silhouette leave the hip and come straight to
  // the floor. Sixty-eight columns rather than forty-four, so the deeper
  // of its two fold frequencies survives being sampled.
  //
  // And again for the garment itself, which is a different garment now.
  // Shiva's default was a cream dhoti to the ankle with the tiger skin
  // slung over it; in the Studio that read as a leopard belt over a cream
  // cylinder, and the cylinder was the first thing anyone asked about.
  // The skin IS the lower garment now — the layered look is still offered
  // and still loads — and the skin was rebuilt for being worn on the body
  // rather than over four centimetres of gathered cloth.
  //
  // And again for the hands, which now close on what they hold. The body
  // bakes two closures — one round something thin, one round something
  // fist-sized — instead of one fist dialled to a fraction, and the seat
  // an object rests on is the seat those closures were baked around
  // rather than a second computation of it. Every finger moves.
  //
  // And for a throat that is violet where a throat is and a serpent that
  // is not inspecting the figure's mouth: the halahala band was centred
  // on a landmark named for the jaw that is actually the head joint,
  // inside the skull, and the naga's route came out thirty degrees off
  // the front instead of at the shoulder.
  //
  // And once more for the garment, which is a different kind of object
  // now: one strip of hide wound round the hips with its far end over its
  // near one and its last stretch falling as a tail, instead of a ring of
  // cloth with a shaped hem. Five nodes fewer, because the two thigh
  // sleeves and the front fan are gone — the strip's own far end is the
  // hanging part.
  shiva: { nodes: 335, digest: "8ef3edb06b8c9aa8" },
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
