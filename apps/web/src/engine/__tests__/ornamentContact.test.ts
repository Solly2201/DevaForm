/**
 * Is every ornament actually ON the figure?
 *
 * `penetration.test` asks the opposite question — how far INTO the body
 * each thing reaches, with a table of reasons for the ones that should.
 * Nothing asked the other half, and the other half is a defect a person
 * sees instantly: a necklace hanging in the air a centimetre off the
 * chest, an armlet floating round an arm it never touches.
 *
 * A worn thing has a relationship with a surface. It can press into it
 * (a kundala through an earlobe, a sash biting into cloth) and it can lie
 * against it, but it cannot hover. So: for every ornament a customer can
 * put on each deity, how far is the nearest point of it from the nearest
 * point of the figure.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is decide what the right distance
 * is from first principles. A garland hangs away from the body at the
 * bottom of its loop; a crown's finial is a foot above everything. The
 * question is only whether the ornament touches the figure SOMEWHERE —
 * the thing that makes it worn rather than placed near.
 */
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
  import("./glbLoader").then((module) => module.diskLoader()),
);

import { DEITIES as DEITY_REGISTRY, listAssets } from "@devaform/asset-system";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type SocketId,
} from "@devaform/character-schema";
import { buildRig, poseRig, settleOnSupport } from "../rig";
import { ZoneMaterials } from "../materials";
import { deformedVertex } from "../skinning";

async function build(config: CharacterConfiguration) {
  const materials = new ZoneMaterials();
  let rig = buildRig(config, materials);
  for (let attempt = 0; attempt < 6 && rig.pending.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rig = buildRig(config, materials);
  }
  poseRig(rig, config.pose);
  settleOnSupport(rig);
  rig.root.updateWorldMatrix(true, true);
  return { rig, materials };
}

function pointsNamed(rig: ReturnType<typeof buildRig>, name: string): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let mine = false;
    while (owner && owner !== rig.root) {
      if (owner.name === name) {
        mine = true;
        break;
      }
      owner = owner.parent;
    }
    if (!mine) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 1500));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  });
  return points;
}

/**
 * Everything the figure is made of that an ornament could rest on: its
 * flesh, and whatever else it is already wearing.
 *
 * Hair and garments count. A crown rests on hair, a belt rests on cloth,
 * and measuring either against bare skin would report a correct ornament
 * as floating by exactly the thickness of what is under it.
 */
function surfacesOf(rig: ReturnType<typeof buildRig>, exclude: string): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  rig.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let owner: THREE.Object3D | null = node;
    let label = "";
    while (owner && owner !== rig.root) {
      if (typeof owner.name === "string" && owner.name.length > 0) {
        label = owner.name;
        break;
      }
      owner = owner.parent;
    }
    if (label === exclude) return;
    // Bases are scenery, not the figure: an anklet is not worn on a lotus.
    if (label.startsWith("base:")) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 2500));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      points.push(point.clone());
    }
  });
  return points;
}

/**
 * The nearest approach between two clouds, in millimetres.
 *
 * Bucketed into a coarse grid first, because the honest O(n·m) over two
 * clouds of several thousand points each, for every ornament on every
 * deity, is minutes of wall clock. The bucket size is larger than any
 * distance being asserted, so nothing near can be missed.
 */
function nearestApproachMm(
  from: readonly THREE.Vector3[],
  to: readonly THREE.Vector3[],
): number {
  const CELL = 0.03;
  const grid = new Map<string, THREE.Vector3[]>();
  const key = (x: number, y: number, z: number) =>
    `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}:${Math.floor(z / CELL)}`;
  for (const point of to) {
    const k = key(point.x, point.y, point.z);
    const cell = grid.get(k);
    if (cell) cell.push(point);
    else grid.set(k, [point]);
  }
  let best = Number.POSITIVE_INFINITY;
  for (const point of from) {
    const cx = Math.floor(point.x / CELL);
    const cy = Math.floor(point.y / CELL);
    const cz = Math.floor(point.z / CELL);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const cell = grid.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
          if (!cell) continue;
          for (const other of cell) {
            const d = point.distanceToSquared(other);
            if (d < best) best = d;
          }
        }
      }
    }
  }
  return Number.isFinite(best) ? Math.sqrt(best) * 1000 : Number.POSITIVE_INFINITY;
}

const FIGURES: ReadonlyArray<[string, () => CharacterConfiguration]> = [
  ["ganesha", createDefaultGaneshaConfiguration],
  ["shiva", createDefaultShivaConfiguration],
  ["vishnu", createDefaultVishnuConfiguration],
];

/** The ornament sockets this deity's editor offers, from the registry. */
function ornamentSockets(deity: string): SocketId[] {
  const entry = DEITY_REGISTRY.find((candidate) => candidate.id === deity) as
    | { categories?: ReadonlyArray<{ id: string; content: unknown }> }
    | undefined;
  const sockets: SocketId[] = [];
  for (const category of entry?.categories ?? []) {
    if (category.id !== "ornaments") continue;
    const content = category.content as { sockets?: readonly SocketId[] };
    for (const socket of content.sockets ?? []) {
      if (!sockets.includes(socket)) sockets.push(socket);
    }
  }
  return sockets;
}

describe.each(FIGURES)("%s's ornaments", (deity, make) => {
  const base = make();
  const options: Array<{ id: string; version: number; socket: SocketId }> = [];
  for (const socket of ornamentSockets(deity)) {
    for (const asset of listAssets({
      deity: deity as "ganesha" | "shiva" | "vishnu",
      socket,
    })) {
      options.push({ id: asset.id, version: asset.version, socket });
    }
  }

  it("the editor offers ornaments", () => {
    expect(options.length, `${deity} has ornaments`).toBeGreaterThan(0);
  });

  it.each(options.map((option) => [option.id, option] as const))(
    "%s rests on the figure rather than near it",
    async (assetId, option) => {
      const config: CharacterConfiguration = {
        ...base,
        attachments: [
          ...base.attachments.filter((entry) => entry.socket !== option.socket),
          { socket: option.socket, asset: { assetId, version: option.version } },
        ],
      };
      const { rig, materials } = await build(config);
      try {
        const ornament = pointsNamed(rig, `attachment:${assetId}`);
        if (ornament.length === 0) return; // the resolver declined it; showcase.test covers that
        const figure = surfacesOf(rig, `attachment:${assetId}`);
        expect(figure.length, "there is a figure to rest on").toBeGreaterThan(100);

        const gap = nearestApproachMm(ornament, figure);
        /**
         * FIVE MILLIMETRES.
         *
         * An ornament that touches reports zero — it is usually inside
         * something by a millimetre or two, which is what `penetration`
         * governs. Five is the slack for sampling: both clouds are
         * strided, so the true nearest pair may not both be sampled, and
         * on a coarse ornament that costs a few millimetres. Anything
         * beyond it is a thing hanging in the air, which is what this
         * exists to catch.
         */
        expect(
          gap,
          `${assetId} comes no closer than ${gap.toFixed(1)} mm to anything on the figure — ` +
            `it is floating`,
        ).toBeLessThan(5);
      } finally {
        materials.dispose();
      }
    },
    180_000,
  );
});
