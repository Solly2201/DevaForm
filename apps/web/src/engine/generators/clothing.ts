/**
 * Clothing generators: dhoti styles and the angavastram shawl.
 */
import * as THREE from "three";
import { mesh, pleatedCylinder, taperedTube, type V3 } from "../geometry";
import { num, type PartGenerator } from "./types";

export const ganeshaDhoti: PartGenerator = (ctx) => {
  const garment = ctx.materials.get("garment");
  const accent = ctx.materials.get("garmentAccent");
  const length = num(ctx, "length", 1);
  const layered = num(ctx, "layered", 0);
  const bulk = ctx.proportions.bulk;
  const group = new THREE.Group();

  const topR = 0.158 * bulk;
  const skirtLength = 0.2 + 0.17 * length;
  const hemY = 0.055 - skirtLength;

  // Main pleated skirt
  group.add(
    mesh(pleatedCylinder(topR, topR * 0.82, skirtLength, 16, 0.007), garment, {
      position: [0, 0.055 - skirtLength / 2, 0],
    }),
  );
  // Hem band
  group.add(
    mesh(new THREE.TorusGeometry(topR * 0.82, 0.009, 10, 48), accent, {
      position: [0, hemY + 0.004, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  if (layered > 0) {
    // Shorter over-layer
    group.add(
      mesh(pleatedCylinder(topR * 1.03, topR * 0.9, skirtLength * 0.55, 22, 0.006), accent, {
        position: [0, 0.055 - (skirtLength * 0.55) / 2, 0],
      }),
    );
  }
  // Waist wrap band
  group.add(
    mesh(new THREE.TorusGeometry(topR * 0.99, 0.016, 12, 48), garment, {
      position: [0, 0.06, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Front pleat fan — three accent strips flaring toward the hem
  const fanStrips = 3;
  for (let i = 0; i < fanStrips; i++) {
    const t = i / (fanStrips - 1) - 0.5;
    const stripLength = skirtLength * (0.88 - Math.abs(t) * 0.14);
    group.add(
      mesh(new THREE.BoxGeometry(0.032, stripLength, 0.005), accent, {
        position: [t * 0.06, 0.05 - stripLength / 2, topR * 0.9 + 0.01],
        rotation: [0.02, 0, t * 0.1],
      }),
    );
  }

  return [{ joint: "pelvis", object: group }];
};

export const ganeshaShawl: PartGenerator = (ctx) => {
  const accent = ctx.materials.get("garmentAccent");
  const group = new THREE.Group();
  const bulk = ctx.proportions.bulk;

  // Diagonal sash from the left shoulder across the chest to the right hip,
  // returning across the back — the classic angavastram/yajnopavita drape.
  const front: V3[] = [
    [0.155 * bulk, 0.13, 0.02],
    [0.1, 0.05, 0.135 * bulk],
    [-0.02, -0.06, 0.16 * bulk],
    [-0.13, -0.17, 0.12 * bulk],
    [-0.165 * bulk, -0.23, 0.02],
  ];
  const back: V3[] = [
    [-0.165 * bulk, -0.23, 0.02],
    [-0.1, -0.1, -0.13 * bulk],
    [0.05, 0.04, -0.145 * bulk],
    [0.155 * bulk, 0.13, 0.02],
  ];
  for (const pts of [front, back]) {
    group.add(new THREE.Mesh(taperedTube(pts, [0.024, 0.024], 32, 10), accent));
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return [{ joint: "chest", object: group }];
};
