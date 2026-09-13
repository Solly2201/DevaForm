/**
 * Head cluster generators: skull, eyes, ears, trunk, tusks.
 *
 * The head is assembled from overlapping smooth volumes shaped after the
 * elephant anatomy of classical Ganesha murtis: twin cranial domes, a broad
 * brow, full cheeks, a muzzle mass the trunk grows out of, and a tilak.
 */
import * as THREE from "three";
import { mesh, taperedTube, type V3 } from "../geometry";
import { num, morph, type PartGenerator } from "./types";

// ---------------------------------------------------------------------------
// HEAD
// ---------------------------------------------------------------------------

export const ganeshaHead: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const dome = num(ctx, "dome", 1);
  const cheek = num(ctx, "cheek", 1);
  const width = num(ctx, "width", 1);
  const browRidge = num(ctx, "browRidge", 0);
  const group = new THREE.Group();
  group.scale.set(width, 1, 1);

  // Main skull — dome raises/lowers the whole cranium profile
  group.add(
    mesh(new THREE.SphereGeometry(0.125, 40, 30), skin, {
      position: [0, 0.07 + 0.012 * dome, 0],
      scale: [1.04, 0.88 + 0.17 * dome, 1.0],
    }),
  );
  // Twin cranial domes — subtle bumps blended into the skull top
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.064, 26, 20), skin, {
        position: [side * 0.044, 0.104 + 0.026 * dome, 0.03],
        scale: [1, 0.88, 1],
      }),
    );
  }
  if (browRidge > 0) {
    // Regal variant: pronounced brow bar proud of the brow plate
    group.add(
      mesh(new THREE.CapsuleGeometry(0.014, 0.115, 8, 14), skin, {
        position: [0, 0.105, 0.118],
        rotation: [0.5, 0, Math.PI / 2],
        scale: [1, 1, 0.75],
      }),
    );
  }
  // Brow plate
  group.add(
    mesh(new THREE.SphereGeometry(0.102, 32, 24), skin, {
      position: [0, 0.065, 0.048],
      scale: [1.12, 0.78, 0.82],
    }),
  );
  // Cheeks
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.07 * cheek, 26, 20), skin, {
        position: [side * 0.062, -0.002, 0.048],
        scale: [1, 0.95, 0.9],
      }),
    );
  }
  // Muzzle mass (trunk root grows from here)
  group.add(
    mesh(new THREE.SphereGeometry(0.062, 26, 20), skin, {
      position: [0, -0.02, 0.068],
      scale: [1.28, 0.85, 0.95],
    }),
  );
  // Lower jaw hint (visible each side of the trunk)
  group.add(
    mesh(new THREE.SphereGeometry(0.052, 22, 16), skin, {
      position: [0, -0.062, 0.042],
      scale: [1.35, 0.62, 0.85],
    }),
  );
  // Mouth corners — subtle shaded creases beside the trunk root
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.01, 12, 10), ctx.materials.fixed.mouthDark, {
        position: [side * 0.047, -0.068, 0.072],
        scale: [1.6, 0.45, 0.45],
      }),
    );
  }
  // Tilak — vertical vermilion mark with an upper dot
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0085, 0.052, 6, 12), ctx.materials.fixed.tilak, {
      position: [0, 0.096, 0.119],
      rotation: [0.28, 0, 0],
      scale: [1, 1, 0.35],
    }),
  );
  group.add(
    mesh(new THREE.SphereGeometry(0.0075, 12, 10), ctx.materials.fixed.tilak, {
      position: [0, 0.148, 0.098],
      scale: [1, 1, 0.4],
    }),
  );

  return [{ joint: "head", object: group }];
};

// ---------------------------------------------------------------------------
// EYES
// ---------------------------------------------------------------------------

export const ganeshaEyes: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const lidCover = num(ctx, "lidCover", 1.15); // radians of upper-lid cap
  const shapeX = num(ctx, "shapeX", 1);
  const shapeY = num(ctx, "shapeY", 1);
  const kohl = num(ctx, "kohl", 0);
  const gazeDown = num(ctx, "gazeDown", 0.25);
  const irisScale = num(ctx, "iris", 1);

  const size = 1 + 0.28 * morph(ctx, "eyeSize");
  const spacing = 0.049 * (1 + 0.28 * morph(ctx, "eyeSpacing"));
  const height = 0.062 + 0.02 * morph(ctx, "eyeHeight");
  const browLift = 0.017 * morph(ctx, "browHeight");

  const group = new THREE.Group();

  for (const side of [1, -1]) {
    const eye = new THREE.Group();
    // Seated on the brow-plate surface (brow front reaches z≈0.132).
    eye.position.set(side * spacing, height, 0.124);
    eye.rotation.y = side * 0.28;
    eye.rotation.x = 0.08;
    eye.scale.setScalar(size);
    eye.scale.x *= shapeX;
    eye.scale.y *= shapeY;

    const r = 0.0195;
    // Socket rim — seats the eye in the face instead of resting on it
    eye.add(
      mesh(new THREE.TorusGeometry(r * 1.05, 0.006, 10, 24), skin, {
        position: [0, 0, -0.006],
        scale: [1.05, 1.0, 0.65],
      }),
    );
    // Eyeball
    eye.add(mesh(new THREE.SphereGeometry(r, 24, 18), ctx.materials.fixed.eyeWhite));
    // Iris + pupil, tilted toward the devotee (slightly downward gaze)
    const irisGroup = new THREE.Group();
    irisGroup.rotation.x = gazeDown;
    irisGroup.add(
      mesh(new THREE.SphereGeometry(0.0115 * irisScale, 18, 14), ctx.materials.fixed.iris, {
        position: [0, 0, r - 0.004],
        scale: [1, 1, 0.45],
      }),
    );
    irisGroup.add(
      mesh(new THREE.SphereGeometry(0.0058 * irisScale, 14, 10), ctx.materials.fixed.eyeDark, {
        position: [0, 0, r - 0.0005],
        scale: [1, 1, 0.4],
      }),
    );
    eye.add(irisGroup);

    // Upper eyelid — a skin cap hooded over the top-front of the eyeball.
    // Higher lidCover both extends the cap and tilts it further forward,
    // so "serene" eyes read half-closed rather than wide open.
    const upperLid = mesh(
      new THREE.SphereGeometry(r * 1.14, 24, 12, 0, Math.PI * 2, 0, lidCover),
      skin,
      { rotation: [(lidCover - 1.4) * 0.9 - 0.05, 0, 0] },
    );
    eye.add(upperLid);
    // Lower lid
    eye.add(
      mesh(new THREE.SphereGeometry(r * 1.08, 24, 8, 0, Math.PI * 2, Math.PI - 0.55, 0.55), skin, {
        rotation: [0.25, 0, 0],
      }),
    );
    // Lash line / kohl liner along the upper lid edge
    eye.add(
      mesh(new THREE.TorusGeometry(r * 1.06, 0.0021, 8, 24, Math.PI * 0.95), ctx.materials.fixed.eyeDark, {
        rotation: [lidCover - 1.35, 0.15, Math.PI * 0.03],
        position: [0, 0.002, 0.002],
      }),
    );
    if (kohl > 0) {
      // Almond extension past the outer corner
      eye.add(
        mesh(new THREE.CapsuleGeometry(0.0018, 0.012, 4, 8), ctx.materials.fixed.eyeDark, {
          position: [side * 0.021, 0.004, 0.006],
          rotation: [0, 0, side * -1.25],
        }),
      );
    }

    group.add(eye);

    // Brow — arched tube above the eye
    const bx = side * spacing;
    const browPts: V3[] = [
      [bx - side * 0.028, height + 0.028 + browLift, 0.126],
      [bx, height + 0.04 + browLift, 0.131],
      [bx + side * 0.032, height + 0.03 + browLift, 0.122],
    ];
    group.add(
      new THREE.Mesh(taperedTube(browPts, [0.0035, 0.0018], 12, 8), ctx.materials.get("skinSecondary")),
    );
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false; // avoid eye self-shadow acne
      o.receiveShadow = true;
    }
  });

  return [{ joint: "head", object: group }];
};

// ---------------------------------------------------------------------------
// EARS
// ---------------------------------------------------------------------------

export const ganeshaEars: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const inner = ctx.materials.get("skinSecondary");
  const style = num(ctx, "size", 1);
  const fold = num(ctx, "fold", 0);
  const trim = num(ctx, "trim", 0);

  const size = style * (1 + 0.3 * morph(ctx, "earSize"));
  const angle = morph(ctx, "earAngle") * 0.35;

  const group = new THREE.Group();
  for (const side of [1, -1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.147, 0.06, 0.002);
    ear.rotation.y = side * (0.42 + fold * 0.4 + angle);
    ear.rotation.z = side * -0.14;
    ear.scale.setScalar(size * 1.12);

    // Outer ear sheet
    ear.add(
      mesh(new THREE.SphereGeometry(0.1, 30, 24), skin, {
        scale: [0.92, 1.18 - fold * 0.18, 0.2],
      }),
    );
    // Raised rim
    ear.add(
      mesh(new THREE.TorusGeometry(0.092, 0.011, 10, 32), skin, {
        scale: [0.92, 1.16 - fold * 0.18, 0.55],
      }),
    );
    // Inner ear depression
    ear.add(
      mesh(new THREE.SphereGeometry(0.074, 26, 20), inner, {
        position: [0, 0.004, 0.014],
        scale: [0.82, 1.06 - fold * 0.16, 0.1],
      }),
    );
    // Lobe
    ear.add(
      mesh(new THREE.SphereGeometry(0.03, 16, 12), skin, {
        position: [side * -0.015, -0.118 * (1 - fold * 0.2), 0.004],
        scale: [0.9, 1.15, 0.5],
      }),
    );
    if (trim > 0) {
      // Decorative variant: gold rim band following the ear edge
      ear.add(
        mesh(new THREE.TorusGeometry(0.096, 0.0055, 10, 34), ctx.materials.get("metal"), {
          scale: [0.92, 1.16 - fold * 0.18, 0.7],
          position: [0, 0, 0.012],
        }),
      );
    }
    group.add(ear);
  }
  return [{ joint: "head", object: group }];
};

// ---------------------------------------------------------------------------
// TRUNK
// ---------------------------------------------------------------------------

/** Radius with subtle annular wrinkles so the trunk reads organic. */
const wrinkled =
  (r0: number, r1: number, waves = 7) =>
  (t: number) =>
    (r0 + (r1 - r0) * t) * (1 + 0.016 * Math.sin(t * waves * Math.PI * 2));

export const ganeshaTrunk: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const curl = num(ctx, "curl", 1); // 1 left, -1 right, 0 straight
  const length = num(ctx, "length", 1); // asset variant length
  const lift = num(ctx, "lift", 0); // 1 = tip sweeps upward
  const lengthScale = length * (1 + 0.18 * morph(ctx, "trunkLength"));
  const curlScale = (curl === 0 && lift > 0 ? 1 : curl) * (1 + 0.5 * morph(ctx, "trunkCurl"));

  const L = (y: number) => y * lengthScale;

  // Body-fit is a CLEARANCE constraint, not a shape driver: the drape is
  // authored against the classic body (belly front ≈ 0.207 spine-local),
  // and bodies with a deeper belly shift the lower trunk outward so it is
  // not swallowed. Slimmer bodies never pull the trunk inward — the
  // authored curve simply stands free in front of them.
  const bellyDelta = Math.min(0.035, Math.max(0, ctx.body.bellyFrontZ - 0.207));
  const F = (z: number, weight: number) => z + bellyDelta * weight;

  // Segment paths are authored against the trunk joint chain, which itself
  // sweeps forward (+z) — see skeleton.ts. Local z stays small so pose
  // rotations pivot naturally around each joint.

  // Segment 1 — root (parent: trunkBase joint), swelling out of the muzzle
  const base = new THREE.Group();
  base.add(
    mesh(new THREE.SphereGeometry(0.052, 24, 18), skin, {
      position: [0, 0.012, 0.004],
      scale: [1.05, 0.9, 1],
    }),
  );
  base.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, 0.015, -0.005],
          [0, L(-0.045), 0.038],
          [0, L(-0.09), 0.07],
        ],
        wrinkled(0.05, 0.041),
        24,
        16,
      ),
      skin,
    ),
  );

  // Segment 2 — mid, draping down the front of the chin/shawl line
  const mid = new THREE.Group();
  // Blend sphere hides the articulation seam with segment 1
  mid.add(
    mesh(new THREE.SphereGeometry(0.041, 18, 14), skin, { position: [0, 0.005, 0.008] }),
  );
  mid.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, 0.012, 0.008],
          [0, L(-0.05), F(0.038, 0.3)],
          [curlScale * 0.008, L(-0.095), F(0.062, 0.6)],
        ],
        wrinkled(0.042, 0.033),
        24,
        16,
      ),
      skin,
    ),
  );

  // Segment 3 — long sweep draping over the belly, ending in the classic
  // sideways curl (or lifting upward for the urdhva variant).
  const tipEndPos: [number, number, number] =
    lift > 0
      ? [curlScale * 0.065, L(-0.095) + 0.07 * lift, F(0.06, 1)]
      : [curlScale * 0.085, L(-0.215), F(0.052, 1)];
  const tipPath: V3[] =
    lift > 0
      ? [
          [0, 0.012, 0.008],
          [curlScale * 0.004, L(-0.055), F(0.03, 0.6)],
          [curlScale * 0.016, L(-0.1), F(0.044, 0.85)],
          [curlScale * 0.042, L(-0.125), F(0.054, 1)],
          [curlScale * 0.06, L(-0.11), F(0.058, 1)],
          tipEndPos,
        ]
      : [
          [0, 0.012, 0.008],
          [curlScale * 0.004, L(-0.07), F(0.03, 0.6)],
          [curlScale * 0.012, L(-0.15), F(0.042, 0.85)],
          [curlScale * 0.045, L(-0.225), F(0.048, 1)],
          [curlScale * 0.08, L(-0.24), F(0.05, 1)],
          tipEndPos,
        ];
  const tip = new THREE.Group();
  tip.add(
    mesh(new THREE.SphereGeometry(0.033, 16, 12), skin, { position: [0, 0.005, 0.008] }),
  );
  tip.add(new THREE.Mesh(taperedTube(tipPath, wrinkled(0.033, 0.015, 5), 32, 14), skin));
  // Trunk tip: nostril end + prehensile lip
  const tipEnd = new THREE.Group();
  tipEnd.position.set(...tipEndPos);
  tipEnd.add(mesh(new THREE.SphereGeometry(0.016, 14, 12), skin, { scale: [1, 0.95, 1.05] }));
  tipEnd.add(
    mesh(new THREE.SphereGeometry(0.008, 10, 8), ctx.materials.fixed.mouthDark, {
      position: [curlScale * 0.006, -0.002, 0.011],
      scale: [1, 0.8, 0.7],
    }),
  );
  tipEnd.add(
    mesh(new THREE.SphereGeometry(0.0085, 10, 8), skin, {
      position: [curlScale * 0.011, 0.012, 0.006],
      scale: [0.8, 1.2, 0.8],
    }),
  );
  tip.add(tipEnd);

  return [
    { joint: "trunkBase", object: base },
    { joint: "trunkMid", object: mid },
    {
      joint: "trunkTip",
      object: tip,
      // The trunk owns the trunk.tip socket surface: park it at this
      // variant's actual generated tip so held offerings sit in the curl.
      socketRefinements: [
        {
          id: "trunk.tip",
          position: [tipEndPos[0], tipEndPos[1] - 0.012, tipEndPos[2] + 0.012],
        },
      ],
    },
  ];
};

// ---------------------------------------------------------------------------
// TUSKS
// ---------------------------------------------------------------------------

export const ganeshaTusks: PartGenerator = (ctx) => {
  const ivory = ctx.materials.fixed.ivory;
  const broken = num(ctx, "broken", 1);
  const scale = num(ctx, "scale", 1);
  const curve = num(ctx, "curve", 0);
  const group = new THREE.Group();

  for (const side of [1, -1]) {
    const isBroken = broken > 0.5 && side === -1;
    // Roots emerge low on the muzzle and sweep wide before curving
    // forward, keeping the whole shaft laterally clear of the trunk so
    // tusks read plainly from front, 3/4 and profile.
    const fullPts: V3[] = [
      [side * 0.06, -0.052, 0.064],
      [side * 0.096, -0.08, 0.09],
      [side * (0.104 - curve * 0.012), -0.108, 0.126],
      [side * (0.084 - curve * 0.03), -0.13, 0.166 + curve * 0.012],
    ];
    if (curve > 0.5) {
      fullPts.push([side * 0.05, -0.136, 0.192]);
    }
    const pts = isBroken ? fullPts.slice(0, 2) : fullPts;
    const tusk = new THREE.Mesh(
      taperedTube(pts, isBroken ? [0.019, 0.016] : [0.019, 0.007], 22, 12),
      ivory,
    );
    tusk.scale.setScalar(scale);
    tusk.castShadow = true;
    tusk.receiveShadow = true;
    group.add(tusk);
    // Rounded tip so the taper never vanishes to a sliver
    if (!isBroken) {
      const tip = fullPts[fullPts.length - 1];
      if (tip) {
        group.add(
          mesh(new THREE.SphereGeometry(0.0072, 12, 10), ivory, {
            position: [tip[0] * scale, tip[1] * scale, tip[2] * scale],
          }),
        );
      }
    }
    if (isBroken) {
      // Flat break cap, clearly protruding from the cheek
      group.add(
        mesh(new THREE.SphereGeometry(0.016, 12, 10), ivory, {
          position: [side * 0.096 * scale, -0.08 * scale, 0.09 * scale],
          scale: [1, 0.65, 1],
        }),
      );
    }
  }
  return [{ joint: "head", object: group }];
};
