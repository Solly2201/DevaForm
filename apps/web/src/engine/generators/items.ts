/**
 * Hand-held attribute generators. Items are modeled with their grip point
 * at the origin so the hand's item socket (and a "hold" mudra) closes
 * around them naturally.
 */
import * as THREE from "three";
import { lathe, mesh, taperedTube, type V3 } from "../geometry";
import type { AttachmentGenerator } from "./types";

export const itemModak: AttachmentGenerator = (ctx) => {
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();
  // Ridged dumpling — lathe profile with a pinched peak
  const body = mesh(
    lathe([
      [0.001, 0],
      [0.02, 0.002],
      [0.029, 0.012],
      [0.0295, 0.024],
      [0.022, 0.038],
      [0.012, 0.05],
      [0.005, 0.06],
      [0.0012, 0.066],
    ]),
    accent,
  );
  group.add(body);
  // Pleat ridges
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    group.add(
      mesh(new THREE.CapsuleGeometry(0.0022, 0.03, 4, 8), accent, {
        position: [Math.cos(angle) * 0.019, 0.032, Math.sin(angle) * 0.019],
        rotation: [Math.cos(angle) * 0.45, 0, -Math.sin(angle) * 0.45],
      }),
    );
  }
  group.position.y = -0.012;
  const wrapper = new THREE.Group();
  wrapper.add(group);
  return wrapper;
};

export const itemLotus: AttachmentGenerator = (ctx) => {
  const gem = ctx.materials.get("gem");
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();

  const flower = new THREE.Group();
  flower.position.set(0, 0.075, 0.012);
  // Seed pod
  flower.add(
    mesh(
      lathe([
        [0.002, 0],
        [0.012, 0.004],
        [0.014, 0.014],
        [0.01, 0.02],
      ]),
      accent,
    ),
  );
  // Two rings of petals
  for (const [count, radius, tilt, size] of [
    [8, 0.02, 0.85, 1],
    [6, 0.01, 0.45, 0.8],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (count === 6 ? 0.4 : 0);
      const petal = mesh(new THREE.SphereGeometry(0.016 * size, 12, 10), gem, {
        position: [Math.cos(angle) * radius, 0.008, Math.sin(angle) * radius],
        scale: [0.55, 1.6, 0.35],
      });
      petal.rotation.set(Math.sin(angle) * tilt, -angle, -Math.cos(angle) * tilt);
      flower.add(petal);
    }
  }
  group.add(flower);
  // Curved stem through the grip point
  const stem: V3[] = [
    [0, -0.055, -0.004],
    [0, -0.01, 0.002],
    [0, 0.04, 0.01],
    [0, 0.072, 0.012],
  ];
  group.add(new THREE.Mesh(taperedTube(stem, [0.004, 0.0032], 16, 8), accent));
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
};

export const itemAxe: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Handle through the grip
  const handle: V3[] = [
    [0, -0.075, 0],
    [0.004, 0.02, 0],
    [0.006, 0.12, 0],
  ];
  group.add(new THREE.Mesh(taperedTube(handle, [0.0075, 0.006], 16, 10), metal));
  // Collar
  group.add(
    mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.016, 12), metal, {
      position: [0.005, 0.108, 0],
    }),
  );
  // Crescent blade — half torus flattened
  const blade = mesh(new THREE.TorusGeometry(0.036, 0.011, 10, 28, Math.PI), metal, {
    position: [0.035, 0.115, 0],
    rotation: [0, 0, -Math.PI / 2],
  });
  blade.scale.z = 0.32;
  group.add(blade);
  // Blade edge sweep
  const edge = mesh(new THREE.TorusGeometry(0.043, 0.0045, 8, 28, Math.PI), metal, {
    position: [0.035, 0.115, 0],
    rotation: [0, 0, -Math.PI / 2],
  });
  edge.scale.z = 0.2;
  group.add(edge);
  // Pommel
  group.add(mesh(new THREE.SphereGeometry(0.009, 12, 10), metal, { position: [0, -0.078, 0] }));
  return group;
};

export const itemPasha: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Rope loop above the grip
  const loop = mesh(new THREE.TorusGeometry(0.037, 0.006, 10, 30), metal, {
    position: [0, 0.06, 0.004],
    rotation: [0.25, 0, 0],
  });
  group.add(loop);
  // Twisted texture — small beads along the loop
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    group.add(
      mesh(new THREE.SphereGeometry(0.0032, 8, 6), metal, {
        position: [Math.cos(angle) * 0.037, 0.06 + Math.sin(angle) * 0.036, 0.004 + Math.sin(angle) * 0.009],
      }),
    );
  }
  // Handle rope through the grip with a knot
  const rope: V3[] = [
    [0, -0.05, 0],
    [0.002, 0, 0],
    [0, 0.028, 0.002],
  ];
  group.add(new THREE.Mesh(taperedTube(rope, [0.0055, 0.005], 12, 8), metal));
  group.add(mesh(new THREE.SphereGeometry(0.0085, 10, 8), metal, { position: [0, 0.026, 0.002] }));
  // Tassel
  group.add(
    mesh(new THREE.ConeGeometry(0.0075, 0.022, 10), metal, {
      position: [0, -0.06, 0],
      rotation: [Math.PI, 0, 0],
    }),
  );
  return group;
};
