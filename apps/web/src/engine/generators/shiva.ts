/**
 * Shiva-specific generators: the divine human head, matted jata, crescent
 * moon, third eye, rudraksha mala, naga torque, trishul and damaru.
 *
 * Same rules as every other generator: geometry attaches to skeleton
 * joints, parts refine the sockets whose surface they own, ornaments drape
 * against the measured BodyProfile, and held items keep their grip point
 * at the local origin so the hand's item socket closes around them.
 */
import * as THREE from "three";
import { lathe, mesh, taperedTube, type V3 } from "../geometry";
import { num, type AttachmentGenerator, type PartGenerator } from "./types";
import { chestZAtSocket } from "./ornaments";

// ---------------------------------------------------------------------------
// HEAD — serene divine face with human ears
// ---------------------------------------------------------------------------

export const shivaHead: PartGenerator = (ctx) => {
  const skin = ctx.materials.get("skin");
  const inner = ctx.materials.get("skinSecondary");
  const group = new THREE.Group();
  // The humanoid head joint sits high (shared skeleton); seat the human
  // head lower on it so the chin-to-shoulder gap reads as a real neck.
  group.position.y = -0.03;

  // Cranium
  group.add(
    mesh(new THREE.SphereGeometry(0.082, 36, 28), skin, {
      position: [0, 0.075, -0.005],
      scale: [0.95, 1.05, 0.98],
    }),
  );
  // Brow/face plate — the surface the eyes and third eye seat against
  group.add(
    mesh(new THREE.SphereGeometry(0.07, 32, 24), skin, {
      position: [0, 0.045, 0.03],
      scale: [0.98, 0.9, 0.75],
    }),
  );
  // Cheeks
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.028, 24, 18), skin, {
        position: [side * 0.034, 0.003, 0.038],
        scale: [1, 1.15, 0.72],
      }),
    );
  }
  // Jaw and chin
  group.add(
    mesh(new THREE.SphereGeometry(0.05, 26, 20), skin, {
      position: [0, -0.028, 0.018],
      scale: [0.84, 0.95, 0.8],
    }),
  );
  group.add(
    mesh(new THREE.SphereGeometry(0.02, 16, 12), skin, {
      position: [0, -0.06, 0.042],
      scale: [1.05, 0.9, 0.9],
    }),
  );
  // Nose — bridge tube with nostril wings
  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, 0.05, 0.072],
          [0, 0.022, 0.086],
          [0, 0.004, 0.093],
        ],
        [0.0115, 0.008],
        16,
        10,
      ),
      skin,
    ),
  );
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0075, 12, 10), skin, {
        position: [side * 0.011, 0.002, 0.083],
        scale: [1, 0.85, 0.9],
      }),
    );
  }
  // Lips — gentle serene mouth
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0048, 0.02, 6, 10), inner, {
      position: [0, -0.02, 0.077],
      rotation: [0.12, 0, Math.PI / 2],
      scale: [1, 1, 0.7],
    }),
  );
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0055, 0.014, 6, 10), inner, {
      position: [0, -0.031, 0.0755],
      rotation: [-0.1, 0, Math.PI / 2],
      scale: [1, 1, 0.75],
    }),
  );
  // Human ears with lobes
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.02, 16, 12), skin, {
        position: [side * 0.074, 0.025, 0.002],
        scale: [0.35, 1.25, 0.7],
      }),
    );
    group.add(
      mesh(new THREE.SphereGeometry(0.009, 12, 10), skin, {
        position: [side * 0.072, -0.002, 0.006],
        scale: [0.5, 1, 0.7],
      }),
    );
  }
  // Neck blend into the body's neck cylinder
  group.add(
    mesh(new THREE.SphereGeometry(0.05, 20, 14), skin, {
      position: [0, -0.066, -0.006],
      scale: [1.15, 0.95, 0.95],
    }),
  );

  return [
    {
      joint: "head",
      object: group,
      // The head owns its brow and skull-top surfaces: seat the forehead
      // (third eye / tikka) and crown sockets on the generated geometry.
      socketRefinements: [
        { id: "head.forehead", position: [0, 0.045, 0.077] },
        { id: "head.crown", position: [0, 0.128, -0.005] },
      ],
    },
  ];
};

// ---------------------------------------------------------------------------
// JATA — matted locks coiled into the ascetic's crown
// ---------------------------------------------------------------------------

export const shivaJata: PartGenerator = (ctx) => {
  const hair = ctx.materials.get("hair");
  const flowing = num(ctx, "flowing", 0);
  const group = new THREE.Group();
  // Seat the jata on the lowered head (see shivaHead).
  group.position.y = -0.03;

  // Hair cap over the cranium
  group.add(
    mesh(new THREE.SphereGeometry(0.086, 32, 24), hair, {
      position: [0, 0.088, -0.01],
      scale: [0.97, 0.82, 0.99],
    }),
  );
  // Hairline rim framing the brow
  group.add(
    mesh(new THREE.TorusGeometry(0.072, 0.013, 10, 32), hair, {
      position: [0, 0.112, -0.004],
      rotation: [Math.PI / 2 - 0.18, 0, 0],
      scale: [1, 0.92, 1],
    }),
  );
  // Coiled bun — stacked tori tapering to a topknot
  const coils: ReadonlyArray<readonly [number, number]> = [
    [0.052, 0.152],
    [0.043, 0.178],
    [0.033, 0.201],
    [0.021, 0.221],
  ];
  for (const [r, y] of coils) {
    group.add(
      mesh(new THREE.TorusGeometry(r, 0.015, 10, 28), hair, {
        position: [0, y, -0.002],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }
  group.add(
    mesh(new THREE.SphereGeometry(0.016, 14, 10), hair, { position: [0, 0.238, -0.002] }),
  );
  // Vertical matted strands ribbing the bun
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.3;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [x * 0.062, 0.125, z * 0.062 - 0.004],
            [x * 0.05, 0.17, z * 0.05 - 0.003],
            [x * 0.026, 0.212, z * 0.026 - 0.002],
            [x * 0.008, 0.235, z * 0.008 - 0.002],
          ],
          [0.0075, 0.003],
          14,
          8,
        ),
        hair,
      ),
    );
  }

  if (flowing > 0) {
    // Matted strands falling behind the ears to the shoulders
    for (const side of [1, -1]) {
      for (const [dx, dz, len] of [
        [0.07, -0.02, 0.2],
        [0.05, -0.045, 0.17],
        [0.082, 0.005, 0.16],
      ] as const) {
        group.add(
          new THREE.Mesh(
            taperedTube(
              [
                [side * dx, 0.09, dz],
                [side * (dx + 0.02), 0.0, dz - 0.008],
                [side * (dx + 0.026), 0.09 - len, dz],
              ],
              [0.011, 0.005],
              14,
              8,
            ),
            hair,
          ),
        );
      }
    }
  }

  return [
    {
      joint: "head",
      object: group,
      // The jata owns the crescent's seat: park the moon socket on the
      // right face of the coiled bun.
      socketRefinements: [{ id: "head.moon", position: [0.046, 0.158, 0.028] }],
    },
  ];
};

// ---------------------------------------------------------------------------
// CRESCENT MOON — seats on the jata's moon socket
// ---------------------------------------------------------------------------

export const ornamentCrescent: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Crescent arc with horns pointing upward, facing forward. The arc is
  // rotated so its gap sits at the top; tips are capped with spheres.
  const arc = Math.PI * 1.2;
  const phi = Math.PI / 2 - arc / 2 + Math.PI;
  const crescent = mesh(new THREE.TorusGeometry(0.032, 0.0062, 10, 30, arc), metal, {
    rotation: [0, 0, phi],
  });
  crescent.scale.z = 0.55;
  group.add(crescent);
  for (const end of [0, arc]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0045, 10, 8), metal, {
        position: [Math.cos(end + phi) * 0.032, Math.sin(end + phi) * 0.032, 0],
      }),
    );
  }
  // Angle the moon outward from the jata it seats on
  group.rotation.y = 0.25;
  return group;
};

// ---------------------------------------------------------------------------
// THIRD EYE — vertical trinetra on the forehead socket
// ---------------------------------------------------------------------------

export const ornamentThirdEye: AttachmentGenerator = (ctx) => {
  const group = new THREE.Group();
  // Vertical almond: white of the eye
  group.add(
    mesh(new THREE.SphereGeometry(0.012, 18, 14), ctx.materials.fixed.eyeWhite, {
      scale: [0.42, 1.25, 0.35],
    }),
  );
  // Iris + pupil
  group.add(
    mesh(new THREE.SphereGeometry(0.0055, 12, 10), ctx.materials.fixed.iris, {
      position: [0, 0, 0.0035],
      scale: [0.75, 1, 0.4],
    }),
  );
  group.add(
    mesh(new THREE.SphereGeometry(0.0028, 10, 8), ctx.materials.fixed.eyeDark, {
      position: [0, 0, 0.0052],
      scale: [0.8, 1, 0.4],
    }),
  );
  // Vermilion rim framing the almond
  const rim = mesh(new THREE.TorusGeometry(0.0115, 0.0018, 8, 22), ctx.materials.fixed.tilak, {
    scale: [0.48, 1.3, 0.6],
  });
  group.add(rim);
  return group;
};

// ---------------------------------------------------------------------------
// RUDRAKSHA MALA — bead strands draped on the measured chest
// ---------------------------------------------------------------------------

export const ornamentRudraksha: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const bead = ctx.materials.fixed.rudraksha;
  const group = new THREE.Group();
  const neckR = 0.077;
  for (const [drop, spread, size] of [
    [0.055, 0.01, 0.008],
    [0.095, 0.02, 0.009],
  ] as const) {
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const frontness = Math.max(0, Math.sin(angle));
      const x = Math.cos(angle) * (neckR + frontness * spread);
      const y = 0.008 - frontness * drop;
      const zNeck = Math.sin(angle) * neckR * 0.7;
      const z =
        frontness > 0.05
          ? Math.max(zNeck, chestZAtSocket(ctx, x, y, 0.007))
          : zNeck;
      // Rudraksha seeds with occasional gold spacers
      group.add(
        mesh(new THREE.SphereGeometry(size, 10, 8), i % 9 === 0 ? metal : bead, {
          position: [x, y, z],
          scale: [1, 0.88, 1],
        }),
      );
    }
  }
  // Central guru bead
  const gy = -0.1;
  group.add(
    mesh(new THREE.SphereGeometry(0.012, 12, 10), bead, {
      position: [0, gy, chestZAtSocket(ctx, 0, gy, 0.009)],
    }),
  );
  return group;
};

// ---------------------------------------------------------------------------
// NAGA TORQUE — serpent coiled around the neck, hood raised
// ---------------------------------------------------------------------------

export const ornamentNaga: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const gem = ctx.materials.get("gem");
  const group = new THREE.Group();
  const neckR = 0.073;
  // Coil: closed loop hugging the neck, front lifted onto the chest surface
  const coil: V3[] = [];
  const samples = 30;
  for (let i = 0; i <= samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const frontness = Math.max(0, Math.sin(angle));
    const x = Math.cos(angle) * (neckR + frontness * 0.012);
    const y = 0.002 - frontness * 0.03 - (i / samples) * 0.012; // gentle spiral
    const zNeck = Math.sin(angle) * neckR * 0.68;
    const z = frontness > 0.05 ? Math.max(zNeck, chestZAtSocket(ctx, x, y, 0.006)) : zNeck;
    coil.push([x, y, z]);
  }
  group.add(new THREE.Mesh(taperedTube(coil, [0.0085, 0.0105], 60, 12), metal));
  // Tail tapering down the chest from the coil's end
  const tail: V3[] = [
    coil[coil.length - 1] as V3,
    [-0.035, -0.055, chestZAtSocket(ctx, -0.035, -0.055, 0.007)],
    [-0.05, -0.085, chestZAtSocket(ctx, -0.05, -0.085, 0.007)],
  ];
  group.add(new THREE.Mesh(taperedTube(tail, [0.0085, 0.0025], 18, 8), metal));
  // Neck rising to the raised hood at the right shoulder
  const rise: V3[] = [
    coil[0] as V3,
    [0.078, 0.045, 0.028],
    [0.072, 0.095, 0.036],
  ];
  group.add(new THREE.Mesh(taperedTube(rise, [0.0105, 0.0075], 18, 10), metal));
  // Hood — flattened oval behind the head
  group.add(
    mesh(new THREE.SphereGeometry(0.016, 18, 14), metal, {
      position: [0.072, 0.104, 0.036],
      scale: [1.5, 1.9, 0.5],
    }),
  );
  // Head nub + gem eyes facing forward
  group.add(
    mesh(new THREE.SphereGeometry(0.0085, 12, 10), metal, {
      position: [0.072, 0.108, 0.043],
      scale: [1, 1.15, 0.8],
    }),
  );
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.0022, 8, 6), gem, {
        position: [0.072 + side * 0.004, 0.112, 0.049],
      }),
    );
  }
  return group;
};

// ---------------------------------------------------------------------------
// TRISHUL — grip at origin, shaft along +Y, world-upright
// ---------------------------------------------------------------------------

export const itemTrishul: AttachmentGenerator = (ctx) => {
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Tall shaft through the grip
  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, -0.3, 0],
          [0, 0.02, 0],
          [0, 0.24, 0],
        ],
        [0.0068, 0.0056],
        16,
        10,
      ),
      metal,
    ),
  );
  // Collar under the head
  group.add(
    mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.016, 12), metal, {
      position: [0, 0.243, 0],
    }),
  );
  // Crossbar the prongs rise from
  group.add(
    mesh(new THREE.CapsuleGeometry(0.0042, 0.062, 6, 10), metal, {
      position: [0, 0.256, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
  );
  // Center prong
  group.add(
    new THREE.Mesh(
      taperedTube(
        [
          [0, 0.256, 0],
          [0, 0.33, 0],
          [0, 0.385, 0],
        ],
        [0.0055, 0.0012],
        14,
        10,
      ),
      metal,
    ),
  );
  // Curved side prongs
  for (const side of [1, -1]) {
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [side * 0.031, 0.252, 0],
            [side * 0.044, 0.3, 0],
            [side * 0.033, 0.352, 0],
            [side * 0.022, 0.372, 0],
          ],
          [0.005, 0.0012],
          18,
          8,
        ),
        metal,
      ),
    );
  }
  // Pommel
  group.add(mesh(new THREE.SphereGeometry(0.0095, 12, 10), metal, { position: [0, -0.304, 0] }));
  return group;
};

// ---------------------------------------------------------------------------
// DAMARU — hourglass drum, gripped at the waist
// ---------------------------------------------------------------------------

export const itemDamaru: AttachmentGenerator = (ctx) => {
  const wood = ctx.materials.get("garmentAccent");
  const metal = ctx.materials.get("metal");
  const group = new THREE.Group();
  // Hourglass body — two cones meeting at the gripped waist
  group.add(
    mesh(
      lathe([
        [0.0245, -0.042],
        [0.0285, -0.037],
        [0.0095, -0.003],
        [0.0095, 0.003],
        [0.0285, 0.037],
        [0.0245, 0.042],
      ]),
      wood,
    ),
  );
  // Drum heads (hide membranes)
  for (const side of [1, -1]) {
    group.add(
      mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.004, 20), ctx.materials.fixed.ivory, {
        position: [0, side * 0.041, 0],
      }),
    );
  }
  // Waist cord
  group.add(
    mesh(new THREE.TorusGeometry(0.0105, 0.0026, 8, 20), metal, {
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  // Striker cords with knots
  for (const side of [1, -1]) {
    group.add(
      new THREE.Mesh(
        taperedTube(
          [
            [side * 0.01, 0, 0],
            [side * 0.034, side * 0.014, 0.006],
            [side * 0.046, side * 0.024, 0.01],
          ],
          [0.0014, 0.0012],
          12,
          6,
        ),
        metal,
      ),
    );
    group.add(
      mesh(new THREE.SphereGeometry(0.0042, 10, 8), metal, {
        position: [side * 0.046, side * 0.024, 0.01],
      }),
    );
  }
  return group;
};
