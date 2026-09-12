/**
 * Statue base builders, keyed by BaseConfiguration style. Bases are built
 * by the rig (not assets) but share the generator context for materials.
 */
import * as THREE from "three";
import { lathe, mesh } from "../geometry";
import type { GeneratorContext } from "./types";

export type BaseBuilder = (ctx: GeneratorContext) => THREE.Object3D;

const roundPedestal: BaseBuilder = (ctx) => {
  const material = ctx.materials.get("base");
  const group = new THREE.Group();
  group.add(
    mesh(
      lathe([
        [0.4, 0],
        [0.41, 0.012],
        [0.37, 0.03],
        [0.33, 0.04],
        [0.325, 0.06],
        [0.35, 0.072],
        [0.355, 0.085],
      ]),
      material,
    ),
  );
  return group;
};

const squarePlinth: BaseBuilder = (ctx) => {
  const material = ctx.materials.get("base");
  const group = new THREE.Group();
  const lower = mesh(new THREE.BoxGeometry(0.72, 0.045, 0.72), material, {
    position: [0, 0.0225, 0],
  });
  const upper = mesh(new THREE.BoxGeometry(0.6, 0.045, 0.6), material, {
    position: [0, 0.0675, 0],
  });
  group.add(lower, upper);
  return group;
};

const lotusSeat: BaseBuilder = (ctx) => {
  const material = ctx.materials.get("base");
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();

  // Plinth disc
  group.add(
    mesh(
      lathe([
        [0.38, 0],
        [0.39, 0.01],
        [0.36, 0.028],
        [0.3, 0.038],
      ]),
      material,
    ),
  );
  // Down-turned outer petal ring
  const outerPetals = 16;
  for (let i = 0; i < outerPetals; i++) {
    const angle = (i / outerPetals) * Math.PI * 2;
    const petal = mesh(new THREE.SphereGeometry(0.075, 14, 10), accent, {
      position: [Math.cos(angle) * 0.3, 0.045, Math.sin(angle) * 0.3],
      scale: [0.55, 0.28, 1.05],
    });
    petal.rotation.y = -angle + Math.PI / 2;
    petal.rotation.x = 0.28;
    group.add(petal);
  }
  // Up-turned inner petal ring
  const innerPetals = 12;
  for (let i = 0; i < innerPetals; i++) {
    const angle = (i / innerPetals) * Math.PI * 2 + 0.2;
    const petal = mesh(new THREE.SphereGeometry(0.07, 14, 10), accent, {
      position: [Math.cos(angle) * 0.22, 0.07, Math.sin(angle) * 0.22],
      scale: [0.5, 0.32, 0.95],
    });
    petal.rotation.y = -angle + Math.PI / 2;
    petal.rotation.x = -0.32;
    group.add(petal);
  }
  // Seat disc
  group.add(
    mesh(
      lathe([
        [0.24, 0.06],
        [0.25, 0.075],
        [0.22, 0.095],
        [0.12, 0.105],
        [0.0, 0.107],
      ]),
      material,
    ),
  );
  return group;
};

const peetam: BaseBuilder = (ctx) => {
  const material = ctx.materials.get("base");
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  group.add(
    mesh(
      lathe([
        [0.42, 0],
        [0.43, 0.015],
        [0.4, 0.03],
        [0.34, 0.042],
        [0.345, 0.06],
        [0.3, 0.072],
        [0.305, 0.09],
        [0.27, 0.1],
      ]),
      material,
    ),
  );
  // Decorative metal trim
  group.add(
    mesh(new THREE.TorusGeometry(0.345, 0.008, 10, 56), metal, {
      position: [0, 0.052, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  return group;
};

export const BASE_BUILDERS: Record<string, BaseBuilder> = {
  round: roundPedestal,
  square: squarePlinth,
  lotus: lotusSeat,
  peetam,
};

/** Height of the base's top surface — the character root sits on it. */
export const BASE_TOP_HEIGHT: Record<string, number> = {
  none: 0,
  round: 0.085,
  square: 0.09,
  lotus: 0.105,
  peetam: 0.1,
};
