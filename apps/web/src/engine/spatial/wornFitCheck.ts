/**
 * Measuring a worn thing against what it CLAIMS to be.
 *
 * `WornFit` is the asset's sentence about its own relationship to a body
 * — a band goes round a wrist, a garland falls from the shoulders to the
 * thigh over the collar. This is where that sentence meets geometry, and
 * it answers in millimetres.
 *
 * WHY EACH KIND NEEDS ITS OWN QUESTION. The reason a single "does it
 * intersect the body" check has never been enough is that the right
 * answer differs by class, and for two classes it is the opposite:
 *
 *   • A BANGLE wants a limb inside it. The question is not clearance, it
 *     is whether the hole admits the wrist — and a bounding box cannot
 *     tell a ring a finger passes through from a ring it jams against,
 *     which `spatial.test.ts` proves with the two boxes being identical.
 *   • An EARRING is supposed to be inside an earlobe. Containment reports
 *     it, and the report is wrong.
 *   • A TILAKA must have no clearance at all. The usual rule — stand off
 *     the skin — makes it a tile stuck to a forehead.
 *
 * THE ANNULUS MACHINERY FINALLY HAS A CUSTOMER. `spatial/derive.fitAnnulus`
 * recovers a ring's hole from its own triangles with no authored
 * constants, and `occupancy.passesThroughVoid` answers whether a capsule
 * passes through that hole. Both have been correct and unused since they
 * were written; `docs/spatial-occupancy-experiment.md` says so in as many
 * words — "today this capability has no shipped customer". This is the
 * customer. Nothing new was built to serve it.
 *
 * VALIDATION, NOT PLACEMENT. Everything here reads finished geometry and
 * reports. It moves nothing, which is the boundary the occupancy
 * experiment settled on and the one this stays inside.
 */
import * as THREE from "three";
import { voidOfAnnulus, type BodyRegion, type WornFit } from "@devaform/asset-system";

/** The tuple the spatial primitives are written in. */
type Vec3 = [number, number, number];
import type { BodyProfile } from "../generators/bodyProfile";
import { fitAnnulus } from "./derive";
import { passesThroughVoid } from "./occupancy";

export interface WornFitReport {
  /** One sentence per thing that is wrong, in millimetres. */
  complaints: string[];
  /** What was actually measured, for a report that found nothing. */
  measured: string;
}

/** A limb or body region, as the capsule a band has to admit. */
export interface RegionProbe {
  /** Centre of the region where the ornament sits, world metres. */
  centre: THREE.Vector3;
  /** Which way the region runs — a limb's bone, a neck's axis. */
  axis: THREE.Vector3;
  /** How thick the region is there, metres. */
  radius: number;
  /** How far the probe extends each way along its axis, metres. */
  halfLength: number;
}

/**
 * What the body says about a region.
 *
 * Only the regions a body can actually measure answer. `BodyProfile`
 * carries three band seats — arm, wrist, ankle — plus the neck and the
 * hips, and nothing for a forearm between them: an arm has no measured
 * envelope at all, where a leg and a torso and a skull do. A region the
 * body cannot speak about returns null and is reported as unmeasurable
 * rather than guessed at, because a validator that invents a radius will
 * pass a band that does not fit.
 */
export function probeFor(
  body: BodyProfile,
  region: BodyRegion,
  at: THREE.Matrix4,
): RegionProbe | null {
  const centre = new THREE.Vector3().setFromMatrixPosition(at);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(at).normalize();
  const limb = (radius: number, halfLength: number): RegionProbe => ({
    centre,
    axis,
    radius,
    halfLength,
  });
  switch (region) {
    case "upperArm":
    case "forearm":
      return limb(body.armBandRadius, 0.05);
    case "wrist":
      return limb(body.wristBandRadius, 0.04);
    case "ankle":
      return limb(body.ankleBandRadius, 0.04);
    case "neck":
      return limb(body.neckRadius, 0.05);
    case "waist":
    case "hips":
      return limb(body.pelvisHalfWidth, 0.06);
    case "thigh":
      return limb(body.thighTopRadius, 0.06);
    default:
      // head, forehead, earlobe, chest: not a cylinder, and nothing here
      // claims to encircle one.
      return null;
  }
}

/**
 * A built piece, one cloud per MESH.
 *
 * Kept separate because an ornament is often a band and a decoration, and
 * only one of them is the thing that goes round a limb. A vanki is two
 * meshes: a ring whose hole takes an arm, and a crest that reaches from
 * fifteen millimetres of the axis out to seventy-two. Fitted as one cloud
 * they recover a "hole" of six millimetres on an arm of thirty-five,
 * which is not a fact about either of them.
 */
export function surfaceOf(object: THREE.Object3D, stride = 1): THREE.Vector3[][] {
  const parts: THREE.Vector3[][] = [];
  object.updateWorldMatrix(true, true);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.getAttribute("position");
    if (!mesh.isMesh || !position) return;
    mesh.updateWorldMatrix(true, false);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i += stride) {
      points.push(
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
      );
    }
    if (points.length) parts.push(points);
  });
  return parts;
}

/** Every vertex of every mesh, for the checks that want the whole thing. */
const allOf = (parts: readonly (readonly THREE.Vector3[])[]): THREE.Vector3[] =>
  parts.flatMap((part) => [...part]);

const mm = (metres: number) => `${(metres * 1000).toFixed(1)}mm`;

/**
 * A ring's own axis, from its own points.
 *
 * Asking the joint it hangs from is what the first version did, and it is
 * the same mistake this whole exercise is about: a band is seated square
 * to its limb by `bandFrame`, which derives that from the direction to
 * the CHILD joint, not from the parent's own +Y. Measured with the wrong
 * axis, a bangle whose hole is thirty-one and a half millimetres reports
 * thirty point four, because the fit is slicing the ring at an angle.
 *
 * A flat ring's axis is the direction its points vary LEAST in — the one
 * thing about a ring that is true however it is seated — so it is taken
 * from the cloud by inverse power iteration on the covariance. No joint,
 * no table, no hint.
 */
export function ringAxisOf(points: readonly THREE.Vector3[]): THREE.Vector3 {
  const centre = new THREE.Vector3();
  for (const point of points) centre.add(point);
  centre.divideScalar(points.length);
  // Covariance, as six numbers.
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (const point of points) {
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    const dz = point.z - centre.z;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  const trace = xx + yy + zz;
  // (trace·I − C) turns the smallest eigenvector into the largest, which
  // plain power iteration finds without any decomposition.
  const apply = (v: THREE.Vector3) =>
    new THREE.Vector3(
      trace * v.x - (xx * v.x + xy * v.y + xz * v.z),
      trace * v.y - (xy * v.x + yy * v.y + yz * v.z),
      trace * v.z - (xz * v.x + yz * v.y + zz * v.z),
    );
  let axis = new THREE.Vector3(0.577, 0.577, 0.577);
  for (let i = 0; i < 48; i += 1) {
    const next = apply(axis);
    if (next.lengthSq() < 1e-18) break;
    axis = next.normalize();
  }
  return axis;
}

/**
 * Hold the piece to what its asset says it is.
 *
 * `probe` is what the body offers for the region in question; a null one
 * means the body cannot measure it, which is reported rather than passed.
 */
export function checkWornFit(
  fit: WornFit,
  parts: readonly (readonly THREE.Vector3[])[],
  probe: RegionProbe | null,
): WornFitReport {
  const piece = allOf(parts);
  if (piece.length < 12) {
    return { complaints: ["the piece has almost no geometry to measure"], measured: "nothing" };
  }

  switch (fit.kind) {
    case "encircles": {
      if (!probe) {
        return {
          complaints: [`claims to encircle the ${fit.region}, which this body does not measure`],
          measured: "no probe",
        };
      }
      /**
       * The hole, recovered from the ring's own triangles, and fitted to
       * the BAND rather than to the jewellery standing on it.
       *
       * Not from a declared radius — the point of the exercise is that
       * the ring says what it is and the geometry has to agree.
       *
       * Among an ornament's meshes, the one that encircles is the one
       * whose hole is widest — a decoration's "hole" is whatever gap its
       * own shape happens to leave, and it is always the smaller. So each
       * mesh is fitted on its own and the best ring wins, which is how a
       * vanki's band is told from the crest standing on it.
       */
      const complaints: string[] = [];
      let ring: ReturnType<typeof fitAnnulus> = null;
      for (const part of parts) {
        if (part.length < 24) continue;
        const candidate = fitAnnulus(part, ringAxisOf(part));
        if (!candidate) continue;
        if (!ring || candidate.innerRadius > ring.innerRadius) ring = candidate;
      }
      if (!ring) {
        return {
          complaints: ["claims to encircle, but none of its meshes is a ring"],
          measured: "no annulus",
        };
      }
      const hold = fit.holdM ?? 0;
      // The limb runs through the ring: take its line from the ring, and
      // its thickness from the body.
      const ringAxis = new THREE.Vector3(...ring.axis).normalize();
      const ringCentre = new THREE.Vector3(...ring.center);
      const end = (sign: number): Vec3 => {
        const point = ringCentre.clone().addScaledVector(ringAxis, sign * probe.halfLength);
        return [point.x, point.y, point.z];
      };
      const through = passesThroughVoid(voidOfAnnulus(ring), {
        shape: "capsule",
        start: end(-1),
        end: end(1),
        radius: probe.radius,
      });
      if (!through) {
        complaints.push(
          `the ${fit.region} does not pass through it: hole ${mm(ring.innerRadius)} against a ` +
            `${mm(probe.radius)} limb`,
        );
      }
      const slack = ring.innerRadius - probe.radius;
      /**
       * WHAT IS CHECKED IS THAT THE BAND DOES NOT BITE.
       *
       * `holdM` is the air the asset intends, and recovering it from
       * geometry is not exact: `fitAnnulus` reports the smallest radius
       * any VERTEX reaches, so a lathe's inscribed polygon reads under
       * its own circle, and the fitted centre carries a little bias of
       * its own. Measured, a band built with a millimetre and a half of
       * air recovers as holding between zero and a half.
       *
       * Failing on that would be failing on the measurement's resolution.
       * The defect this class actually has — the one `ornaments.ts` has
       * recorded four times — is a ring sized at the limb's radius with
       * half its thickness buried in flesh, and that reads as a NEGATIVE
       * hold. So the intent is reported, and a bite is what fails.
       */
      const bite = ring.innerRadius * 0.02 + 0.0005;
      if (slack < -bite) {
        complaints.push(
          `its hole is tighter than the ${fit.region}: ${mm(-slack)} of it is inside the limb`,
        );
      }
      return {
        complaints,
        measured:
          `hole ${mm(ring.innerRadius)}, rim ${mm(ring.outerRadius)}, limb ${mm(probe.radius)}` +
          `, holds ${mm(slack)} of an intended ${mm(hold)}`,
      };
    }

    case "appliedTo": {
      // A mark lies ON skin. Its own depth is what is checked: a mark
      // thicker than a few millimetres is a tile, not a mark.
      const centre = new THREE.Vector3();
      for (const point of piece) centre.add(point);
      centre.divideScalar(piece.length);
      let deepest = 0;
      for (const point of piece) deepest = Math.max(deepest, point.distanceTo(centre));
      const complaints: string[] = [];
      if (deepest > 0.06) {
        complaints.push(`applied to the ${fit.region} but reaches ${mm(deepest)} from its centre`);
      }
      return { complaints, measured: `reach ${mm(deepest)}` };
    }

    case "piercedThrough":
      // Nothing to complain about: being inside the anatomy is the point.
      return { complaints: [], measured: `pierces the ${fit.region}, by design` };

    case "restsOn":
    case "drapes":
      /**
       * Measured where the body surface is, not here.
       *
       * `wearableFit` already answers "how near the skin, how far off it"
       * for anything in the torso band, and `necklaceFit` answers the
       * drape questions that are about layering. Repeating either here
       * would be a second opinion about the same geometry.
       */
      return { complaints: [], measured: "deferred to the surface validators" };

    default:
      return { complaints: [], measured: "unrecognised" };
  }
}
