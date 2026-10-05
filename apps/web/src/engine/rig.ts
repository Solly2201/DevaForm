/**
 * Rig builder.
 *
 * Builds the character's joint hierarchy (real THREE.Object3D transforms —
 * the same articulation model a GLB skeleton maps onto), populates part
 * meshes onto joints, creates sockets and mounts attachments.
 *
 * It DECIDES nothing. `resolveCharacterPresentation` has already reconciled
 * the pose, the hands and every attachment into one deterministic answer;
 * this module turns that answer into geometry. There used to be a second
 * decision-maker here — an inline rule about which hands could hold, an
 * inline grounded placement with its own clearance constant, and a fork
 * between two transform pipelines based on whether the body was a mesh —
 * and a renderer that decides is a renderer that will be asked to decide
 * again for every new attribute.
 *
 * The rig is rebuilt when structure changes (parts/attachments/morphs/
 * hands/arms); pose and materials are applied in place without rebuilding
 * (see pose.ts / materials.ts).
 */
import * as THREE from "three";
import {
  ARM_SLOTS,
  PART_SLOTS,
  getJoint,
  isJointId,
  type ArmSlot,
  type CharacterConfiguration,
  type HandsConfiguration,
  type JointId,
  type PartSlot,
  type PoseConfiguration,
  type SkeletonDefinition,
  type SocketId,
  type Vec3,
} from "@devaform/character-schema";
import {
  isHandheld,
  resolveAssetRef,
  resolveCharacterPresentation,
  resolveGripFrame,
  standsOnGround,
  type AssetDefinition,
  type AttributePresentation,
  type ResolvedAttachment,
  type ResolvedCharacter,
} from "@devaform/asset-system";
import {
  ATTACHMENT_GENERATORS,
  BASE_BUILDERS,
  BASE_TOP_HEIGHT,
  PART_GENERATORS,
  deriveBodyProfile,
  type BodyProfile,
  type GeneratorContext,
  type HeldItemSpec,
} from "./generators";
import { getGlb, instantiateGlb } from "./glbCache";
import {
  applyMorphInfluences,
  bindSkinnedMeshToJoints,
  collectSkinnedMeshes,
  deformedVertex,
  socketNameToSocketId,
} from "./skinning";
import { morphInfluences } from "./morphs";
import type { ZoneMaterials } from "./materials";
import {
  applyGestureOrientations,
  applyGripOrientations,
  applyPose,
  unreachableGrips,
  type HandSolution,
  type HeldItem,
} from "./pose";

/**
 * An attribute whose weight is on the ground.
 *
 * It does not follow the hand: it stands, and the hand slides along its
 * shaft as the arm moves. The slide is along the item's OWN axis, bounded
 * by the travel the asset declares, and how far the butt currently falls
 * short of the base is measured from the item's own geometry rather than
 * from where the hand happened to be when the rig was built.
 */
export interface PlantedAttachment {
  object: THREE.Object3D;
  /** Where the attachment sits in its socket before any slide. */
  rest: THREE.Vector3;
  /** Distance from the socket down to the item's butt, along its own axis. */
  buttBelowAnchor: number;
  /** Height of the base's top surface, in statue-root space. */
  baseTop: number;
  /** World axis the item is presented along. */
  axis: THREE.Vector3;
  /** How far the hand may slide before it reaches something no one grips. */
  travel: { up: number; down: number };
  /**
   * For an attribute standing on its OWN — no hand on it — which side of
   * the figure it stands on and how much air it keeps from the figure's
   * skin.
   *
   * Measured against the POSED body rather than the body profile. The
   * profile describes a figure standing up: its widest statement is a
   * chest or a hip, and a seated figure's knees reach half again as far.
   * A staff set down beside a meditating Shiva at chest width stands in
   * his thigh, which is exactly where the trishul was found. Absent when
   * a hand is on the item — then the hand decides where it is.
   */
  stand?: { side: number; clearanceM: number };
}

export interface CharacterRig {
  root: THREE.Group;
  /** The skeleton this rig was built from — the body's, or the deity's. */
  skeleton: SkeletonDefinition;
  joints: ReadonlyMap<JointId, THREE.Object3D>;
  sockets: ReadonlyMap<SocketId, THREE.Object3D>;
  /** The resolution this rig was built from. The engine's single input. */
  resolved: ResolvedCharacter;
  /**
   * Attributes standing on the ground, held or not. See PlantedAttachment.
   */
  planted: PlantedAttachment[];
  /**
   * What each hand is holding, and which way the item runs in the world.
   * The hand is TURNED onto it — see applyGripOrientations — which is the
   * only mechanism there is. The world-space override that used to sit
   * beside it is gone: it forked the pipeline on whether the body was a
   * mesh, and it overwrote the very grip frame the asset had declared.
   */
  held: HeldItem[];
  /**
   * Upright items whose presentation spends the free spin about the grip
   * channel on a declared facing — a discus turned to look out the front.
   * Applied after the hands are turned, every pose. See faceHeldItems.
   */
  faced: { object: THREE.Object3D; channel: Vec3 }[];
  /**
   * What each hand is doing, pose and configuration reconciled by the
   * resolver. Consumers read THIS, never the configuration.
   */
  hands: HandsConfiguration;
  /**
   * Torso surfaces this rig's body-fitted geometry was built against —
   * measured from a mesh body, or derived from a procedural one.
   */
  body: BodyProfile;
  /** The body this rig was built on, when one was selected. */
  bodyAsset: AssetDefinition | undefined;
  /** Top of the base, in the statue root's own space: the support. */
  baseTop: number;
  /**
   * The body's own geometry — the part of the statue that rests on the
   * base. Ornaments and cloth are not in it: a hem that hangs past the
   * feet would otherwise lift the whole figure off its support.
   */
  bodyMeshes: THREE.Mesh[];
  /** What each hand is closing on — the radius it must close onto. */
  heldByHand: Readonly<Partial<Record<ArmSlot, HeldItemSpec>>>;
  /** Assets that failed to resolve (not fatal). */
  warnings: string[];
  /**
   * GLB-sourced assets whose file has not arrived yet. Empty means the
   * scene is everything the configuration asked for; non-empty means a
   * rebuild is coming. Anything that captures or exports the scene must
   * wait for this to empty, or it records a figure with pieces missing.
   */
  pending: string[];
  /**
   * What the last pose could not achieve — a hand that cannot present
   * what it holds, a staff whose butt left the ground. Replaced on every
   * pose, never appended to, so a hundred slider drags do not produce a
   * hundred copies of the same sentence.
   */
  poseWarnings: string[];
}

/**
 * Every morph influence this rig should carry: the customer's, plus the
 * ones its own state implies. Exposed so the in-place update path cannot
 * drift from what buildRig applied — four call sites used to assemble
 * this by hand, and a hand closing onto what it holds would have reached
 * only whichever of them remembered.
 */
export function rigMorphInfluences(
  rig: CharacterRig,
  configured: Readonly<Record<string, number>>,
): Record<string, number> {
  const asked = morphInfluences(configured, rig.hands, rig.bodyAsset, rig.heldByHand);
  return asked;
}

/** Everything worth telling the developer about this rig, right now. */
export function rigWarnings(rig: CharacterRig): string[] {
  return [...rig.warnings, ...rig.poseWarnings];
}

/**
 * The slots that are the figure itself rather than something it wears.
 *
 * Eyes are deliberately absent: they are inside the head that is already
 * here, and claiming them would make a pupil part of the surface an
 * ornament is measured against. Brows are absent for the opposite
 * reason — they are a selectable variant worn on a face, and a thing
 * worn on a face should stay measurable against it.
 */
const FLESH_SLOTS = new Set<string>(["body", "head", "ears", "tusks", "trunk", "hands"]);

/**
 * The cranium a head part actually built, measured off its own geometry.
 *
 * WHY THE PROFILE CANNOT ANSWER THIS. `BodyProfile` is derived from the
 * BODY asset, and a figure whose head comes from a separate part has a
 * profile describing a head nobody draws. Measured: the stylised profile
 * reports a sixty-seven millimetre cranium — the one `body.ts` would have
 * drawn — while Ganesha's head part draws a skull a hundred and thirty-five
 * millimetres across that reaches fifty-seven millimetres above the crown
 * socket. Every head-worn thing sized from `headRadius` was therefore sized
 * for a head that is not on the figure, and the kirita's band sat entirely
 * inside the skull: only the cone above it showed.
 *
 * Measured rather than declared, because the head may be a GLB. Ganesha's
 * default head is one, so anything an asset or a generator stated by hand
 * would describe the procedural variant and miss the shipped one.
 *
 * `headRadius` is reported at the CROWN SEAT rather than at the cranium's
 * widest, because that is the number a band has to clear, and the
 * reference skull's own figure is used the same way. The seat is where the
 * dome has drawn in to just under three quarters of its widest — above the
 * brow, which is where a crown rides. Seat and radius come from one sweep,
 * so neither can drift from the other or from the geometry.
 *
 * Ears, tusks and a trunk are their own parts and are not in here.
 */
function measureCranium(
  object: THREE.Object3D,
  head: THREE.Object3D,
): { headRadius: number; headCenterY: number; crownSocketY: number; skullTopY: number } | null {
  head.updateWorldMatrix(true, false);
  object.updateWorldMatrix(true, true);
  const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
  const BIN = 0.004;
  const widest = new Map<number, number>();
  const point = new THREE.Vector3();
  let top = -Infinity;
  let bottom = Infinity;
  let maxHalfWidth = 0;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry?.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    // A sculpted head is sixty thousand vertices and this runs on every
    // rig build. A cranium's widest point is a ring, not a vertex.
    const stride = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(toHead);
      const bin = Math.round(point.y / BIN);
      const radius = Math.hypot(point.x, point.z);
      if (radius > (widest.get(bin) ?? 0)) widest.set(bin, radius);
      if (radius > maxHalfWidth) maxHalfWidth = radius;
      if (point.y > top) top = point.y;
      if (point.y < bottom) bottom = point.y;
    }
  });
  if (!Number.isFinite(top) || maxHalfWidth <= 0 || widest.size === 0) return null;

  // Walk DOWN from the top until the dome has widened to the seat.
  const SEAT = 0.72;
  const wanted = maxHalfWidth * SEAT;
  let seatY = top;
  for (let bin = Math.round(top / BIN); bin >= Math.round(bottom / BIN); bin -= 1) {
    if ((widest.get(bin) ?? 0) >= wanted) {
      seatY = bin * BIN;
      break;
    }
  }
  return {
    headRadius: wanted,
    headCenterY: (top + bottom) / 2,
    crownSocketY: seatY,
    skullTopY: top,
  };
}

/**
 * WHAT A CROWN HAS TO GO ROUND is the skull AND whatever is grown on it.
 *
 * `skullAt` describes the cranium. Hair is a separate part, so the profile
 * knew nothing about it, and every head ornament sized itself to a head
 * that was not the one on the figure. Measured on Vishnu: at the height
 * his kirita's band runs, the hair reaches 95 mm and the band was built
 * to 88 mm. The band was therefore INSIDE the hair — invisible — and the
 * only part of the crown a customer could see was the tower emerging from
 * the top of a dark dome, which is why a correctly tapered, correctly
 * seated crown read as a party hat balanced on his head.
 *
 * This is the same lesson every band ornament in this file has already
 * learned once: a worn ring must CONTAIN what it passes. It is applied
 * here rather than in the crown because it is not about crowns — a
 * circlet, a fillet or a garland round the head would all have been wrong
 * in the same way.
 *
 * Returned as a REPLACEMENT `skullAt` that takes the larger of the two at
 * every height, so the original measurement is still what answers
 * wherever the hair is not.
 */
function skullEnvelopeWith(
  previous: BodyProfile["skullAt"],
  object: THREE.Object3D,
  head: THREE.Object3D,
): BodyProfile["skullAt"] | null {
  head.updateWorldMatrix(true, false);
  object.updateWorldMatrix(true, true);
  const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
  const BIN = 0.005;
  const widest = new Map<number, { halfWidth: number; frontZ: number; backZ: number }>();
  const point = new THREE.Vector3();
  let any = false;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry?.getAttribute("position");
    if (!position) return;
    mesh.updateWorldMatrix(true, false);
    // Hair can be tens of thousands of vertices and this runs on every
    // build. An envelope's widest point is a ring, not a vertex.
    const stride = Math.max(1, Math.floor(position.count / 3000));
    for (let i = 0; i < position.count; i += stride) {
      deformedVertex(mesh, i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(toHead);
      const bin = Math.round(point.y / BIN);
      const row = widest.get(bin) ?? {
        halfWidth: 0,
        frontZ: Number.NEGATIVE_INFINITY,
        backZ: Number.POSITIVE_INFINITY,
      };
      row.halfWidth = Math.max(row.halfWidth, Math.abs(point.x));
      row.frontZ = Math.max(row.frontZ, point.z);
      row.backZ = Math.min(row.backZ, point.z);
      widest.set(bin, row);
      any = true;
    }
  });
  if (!any) return null;
  return (y: number) => {
    const skull = previous(y);
    const row = widest.get(Math.round(y / BIN));
    if (!row) return skull;
    return {
      halfWidth: Math.max(skull.halfWidth, row.halfWidth),
      frontZ: Math.max(skull.frontZ, row.frontZ),
      backZ: Math.min(skull.backZ, row.backZ),
    };
  };
}

export function buildJointHierarchy(skeleton: SkeletonDefinition): {
  characterRoot: THREE.Group;
  joints: Map<JointId, THREE.Object3D>;
} {
  const joints = new Map<JointId, THREE.Object3D>();
  const characterRoot = new THREE.Group();
  characterRoot.name = "characterRoot";

  for (const def of skeleton.joints) {
    const joint = new THREE.Object3D();
    joint.name = `joint:${def.id}`;
    joint.position.set(...def.position);
    joints.set(def.id, joint);
    if (def.parent === null) {
      characterRoot.add(joint);
    } else {
      const parent = joints.get(def.parent);
      if (!parent) throw new Error(`Skeleton parent ${def.parent} not built before ${def.id}`);
      parent.add(joint);
    }
  }
  return { characterRoot, joints };
}

const socketBasis = new THREE.Matrix4();

/**
 * Turn a hand's item socket so its +Y runs up the hand's GRIP CHANNEL and
 * its +Z faces the palm.
 *
 * This is the link the whole grip chain hangs off. An asset declares which
 * of its own axes runs up the shaft and `gripFrameTransform` aligns that
 * axis to the socket's +Y; the solver, at the other end, turns the hand so
 * its grip channel points where the item must be presented. If the
 * socket's +Y and the hand's channel are not the same direction, the two
 * halves describe different things — which is what happened, and only a
 * world-space override made the result look acceptable while the shaft
 * still crossed the fingers instead of passing through the fist.
 *
 * Both kinds of hand answer the same question here. A modelled mesh hand
 * measures its own thumb and ships the axis; a procedural hand is drawn
 * around a known axis and says so through a socket refinement. Neither
 * gets a different pipeline for it.
 */
function aimSocket(
  socket: THREE.Object3D,
  channel: THREE.Vector3,
  palmHint: THREE.Vector3,
): void {
  const c = channel.clone().normalize();
  const palm = palmHint.clone().projectOnPlane(c);
  if (palm.lengthSq() < 1e-10) return;
  palm.normalize();
  // Columns (x, y, z): the socket's +Y becomes the channel, its +Z the
  // palm, so an item authored shaft-up lands shaft-along-the-channel.
  socketBasis.makeBasis(c.clone().cross(palm), c, palm);
  socket.quaternion.setFromRotationMatrix(socketBasis);
}

/** Palm direction in the hand's own frame — the shared hand contract. */
const HAND_PALM = new THREE.Vector3(0, 0, 1);

/**
 * Turn a socket worn ON THE SKIN to face the way that skin faces.
 *
 * A forehead slopes back about ten degrees, and a mark built on the plane
 * z = 0 with the socket pointing straight ahead has its upper half inside
 * the skull. Every ornament that goes there used to carry its own
 * `rotation.x = -0.18` — two ornaments, two guesses, about a body that
 * measures its own surface.
 *
 * So the body ships the normal and this turns the socket onto it: +Z
 * becomes the way the face faces, +Y stays up. Anything worn there is
 * then authored flat, facing +Z, the way a decal is — and gets the same
 * treatment on any body that measures itself, for any socket named in
 * `faceAxes`.
 */
function orientMeasuredFaceSockets(
  sockets: Map<SocketId, THREE.Object3D>,
  faceAxes: Readonly<Record<string, readonly [number, number, number]>> | undefined,
): void {
  if (!faceAxes) return;
  const basis = new THREE.Matrix4();
  for (const [id, measured] of Object.entries(faceAxes)) {
    const socket = sockets.get(id as SocketId);
    if (!socket) continue;
    const forward = new THREE.Vector3(...measured);
    if (forward.lengthSq() < 1e-10) continue;
    forward.normalize();
    const up = new THREE.Vector3(0, 1, 0).projectOnPlane(forward);
    if (up.lengthSq() < 1e-10) continue;
    up.normalize();
    basis.makeBasis(new THREE.Vector3().crossVectors(up, forward), up, forward);
    socket.quaternion.setFromRotationMatrix(basis);
  }
}

function orientMeasuredGripSockets(
  sockets: Map<SocketId, THREE.Object3D>,
  body: AssetDefinition | undefined,
  held: Readonly<Partial<Record<ArmSlot, HeldItemSpec>>>,
): void {
  if (!body?.gripAxes) return;
  for (const slot of ARM_SLOTS) {
    // WHICH channel depends on which hand state is holding the thing.
    //
    // A wrapped hand runs what it holds along the knuckle line; a poised
    // one runs it up the raised index. The axis was the knuckle line for
    // everything, so the discus was presented across a hand that had not
    // been asked to close, which is neither of the two relationships the
    // reference sheet shows.
    const poised = held[slot]?.closure === "poise" && body.poiseAxes?.[slot];
    const measured = poised ? body.poiseAxes?.[slot] : body.gripAxes[slot];
    if (!measured) continue;
    const socket = sockets.get(`arm.${slot}.hand.item` as SocketId);
    if (!socket) continue;
    aimSocket(socket, new THREE.Vector3(...measured), HAND_PALM);
  }
}

/**
 * Seat what each hand holds ON the hand, rather than in the middle of the
 * hole the fist makes.
 *
 * The body measures where the skin over its knuckles is and which way its
 * fingers close; an object of radius r rests at seat + normal × r. The
 * grip socket is the one thing between a hand and what it holds, so that
 * is where the measurement lands — no attachment, presentation or asset
 * has to know anything about it.
 *
 * A body that does not measure itself keeps the socket its skeleton
 * declared, which is what the stylised bodies have always used.
 */
function seatMeasuredGrips(
  sockets: Map<SocketId, THREE.Object3D>,
  body: AssetDefinition | undefined,
  held: Readonly<Partial<Record<ArmSlot, HeldItemSpec>>>,
): void {
  if (!body?.gripSeats) return;
  for (const slot of ARM_SLOTS) {
    const item = held[slot];
    if (!item) continue;
    // A poised hand offers its FINGERTIP, and the thing it carries rests
    // a hair above it — the same sentence as the palm seat, about the
    // other baked state.
    const poised = item.closure === "poise" && body.poiseSeats?.[slot];
    const seat = poised ? body.poiseSeats?.[slot] : body.gripSeats[slot];
    const radius = poised ? 0 : item.radius;
    if (!seat || radius === undefined) continue;
    const socket = sockets.get(`arm.${slot}.hand.item` as SocketId);
    if (!socket) continue;
    socket.position
      .set(...(seat.point as [number, number, number]))
      .addScaledVector(new THREE.Vector3(...(seat.normal as [number, number, number])), radius);
  }
}

function buildSockets(
  skeleton: SkeletonDefinition,
  joints: Map<JointId, THREE.Object3D>,
  statueRoot: THREE.Group,
  baseTopHeight: number,
): Map<SocketId, THREE.Object3D> {
  const sockets = new Map<SocketId, THREE.Object3D>();
  for (const def of skeleton.sockets) {
    const socket = new THREE.Object3D();
    socket.name = `socket:${def.id}`;
    socket.position.set(...def.position);
    socket.rotation.set(...def.rotation);
    if (def.anchor === "statue") {
      // Statue-anchored sockets sit on the base's top surface and ignore
      // pose root offsets (companions must not sink with seated poses).
      socket.position.y += baseTopHeight;
      statueRoot.add(socket);
    } else {
      const joint = joints.get(def.joint);
      if (!joint) throw new Error(`Socket ${def.id} references unknown joint ${def.joint}`);
      joint.add(socket);
    }
    sockets.set(def.id, socket);
  }
  return sockets;
}

/** Resolve an asset's renderable object, or null if unavailable (yet). */
function resolveRenderable(
  asset: AssetDefinition,
  ctx: GeneratorContext,
  warnings: string[],
  pending: string[],
): THREE.Object3D | { jointed: ReturnType<(typeof PART_GENERATORS)[string]> } | null {
  if (asset.source.kind === "glb") {
    const entry = getGlb(asset.source.path);
    if (entry.status === "loaded") return instantiateGlb(entry.scene, ctx.materials);
    if (entry.status === "error") warnings.push(`Asset ${asset.id}: ${entry.message}`);
    // Still loading — a cache subscriber rebuild will pick it up. Say so:
    // a rig that is missing its body is not the same thing as a rig that
    // has none, and anything capturing or exporting the scene needs to
    // know the difference. A QA render taken during this window is a
    // picture of a figure with no body in it.
    else pending.push(asset.id);
    return null;
  }
  if (asset.kind.type === "part") {
    const generator = PART_GENERATORS[asset.source.generatorId];
    if (!generator) {
      warnings.push(`Asset ${asset.id}: unknown generator ${asset.source.generatorId}`);
      return null;
    }
    return { jointed: generator(ctx) };
  }
  const generator = ATTACHMENT_GENERATORS[asset.source.generatorId];
  if (!generator) {
    warnings.push(`Asset ${asset.id}: unknown generator ${asset.source.generatorId}`);
    return null;
  }
  return generator(ctx);
}

/**
 * Resolve a declared grip frame into the local transform that puts the
 * asset's grip origin on the socket with its grip axis running up the
 * socket's grip channel (+Y). Identity for assets using the default
 * authoring convention (origin at grip, shaft along +Y).
 */
export function gripFrameTransform(grip: {
  origin?: readonly [number, number, number];
  axis?: readonly [number, number, number];
  roll?: number;
}): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const axis = new THREE.Vector3(...(grip.axis ?? [0, 1, 0])).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    axis,
    new THREE.Vector3(0, 1, 0),
  );
  if (grip.roll) {
    quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), grip.roll),
    );
  }
  const origin = new THREE.Vector3(...(grip.origin ?? [0, 0, 0]));
  const position = origin.clone().applyQuaternion(quaternion).negate();
  return { position, quaternion };
}

function applyAttachmentTransforms(
  object: THREE.Object3D,
  presentation: AttributePresentation,
  resolved: ResolvedAttachment,
): void {
  // Grip frame first: align the asset's declared grip origin/axis with
  // the socket's grip channel. Identity for assets authored in DevaForm's
  // default convention, so this only reorients assets that declare it.
  const grip = presentation.grip;
  if (grip && (grip.origin || grip.axis || grip.roll)) {
    const frame = gripFrameTransform(grip);
    object.quaternion.copy(frame.quaternion);
    object.position.copy(frame.position);
  }
  // Per-socket calibration wins over the default (a modak in the trunk
  // needs a different transform than a modak in a palm). Calibration is
  // ADDITIVE on top of the grip frame.
  const dt = resolved.transform;
  if (dt?.position) {
    object.position.x += dt.position[0];
    object.position.y += dt.position[1];
    object.position.z += dt.position[2];
  }
  if (dt?.rotation) {
    object.rotation.x += dt.rotation[0];
    object.rotation.y += dt.rotation[1];
    object.rotation.z += dt.rotation[2];
  }
  if (dt?.scale !== undefined) object.scale.setScalar(dt.scale);
  const offset = resolved.offset;
  if (offset?.position) {
    object.position.x += offset.position[0];
    object.position.y += offset.position[1];
    object.position.z += offset.position[2];
  }
  if (offset?.rotation) {
    object.rotation.x += offset.rotation[0];
    object.rotation.y += offset.rotation[1];
    object.rotation.z += offset.rotation[2];
  }
  if (offset?.scale !== undefined) object.scale.multiplyScalar(offset.scale);
}

/**
 * The object's extent in its PARENT's frame, from local matrices alone so
 * it does not depend on where the rig currently happens to be.
 */
function boundsInParentFrame(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const slice = new THREE.Box3();
  object.updateMatrix();
  const stack: Array<[THREE.Object3D, THREE.Matrix4]> = [[object, object.matrix.clone()]];
  while (stack.length > 0) {
    const [node, matrix] = stack.pop() as [THREE.Object3D, THREE.Matrix4];
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      slice.copy(mesh.geometry.boundingBox as THREE.Box3).applyMatrix4(matrix);
      box.union(slice);
    }
    for (const child of node.children) {
      child.updateMatrix();
      stack.push([child, new THREE.Matrix4().multiplyMatrices(matrix, child.matrix)]);
    }
  }
  return box;
}

/**
 * How far the item's butt sits below its socket, along the item's own axis.
 *
 * Measured from the geometry that was actually built, so an asset and its
 * length cannot drift apart. This replaces telling the generator how high
 * the hand is and having it build a shaft to suit: a weapon that changes
 * length when the arm moves is not a weapon, and a hand that is told where
 * the ground is has been given the object's job.
 */
function buttBelowAnchor(object: THREE.Object3D): number {
  // The grip frame has already turned the item so its presented axis is
  // the socket's +Y, which makes local -Y the butt.
  return Math.max(0, -boundsInParentFrame(object).min.y);
}

export function buildRig(config: CharacterConfiguration, materials: ZoneMaterials): CharacterRig {
  // ONE resolution. Everything below reads it; nothing below re-decides.
  const resolved = resolveCharacterPresentation(config);
  const { skeleton, armSlots, hands } = resolved;

  const warnings: string[] = [];
  const pending: string[] = [];
  const planted: PlantedAttachment[] = [];
  const held: HeldItem[] = [];
  const faced: { object: THREE.Object3D; channel: Vec3 }[] = [];
  const root = new THREE.Group();
  root.name = "statueRoot";
  const baseTop = BASE_TOP_HEIGHT[config.base.style] ?? 0;
  const { characterRoot, joints } = buildJointHierarchy(skeleton);
  root.add(characterRoot);
  const sockets = buildSockets(skeleton, joints, root, baseTop);

  // What each hand will be closing on, known before any geometry exists —
  // so a hand can be BUILT around what it holds rather than closed to a
  // fixed diameter and hoped for.
  const heldByHand: Partial<Record<ArmSlot, HeldItemSpec>> = {};
  for (const attachment of resolved.attachments) {
    if (!attachment.handSlot) continue;
    heldByHand[attachment.handSlot] = {
      presentationId: attachment.presentation.id,
      radius: attachment.presentation.grip?.radius,
      straight: (() => {
        const travel = attachment.presentation.grip?.travel;
        if (!travel) return undefined;
        return Math.max(travel.up ?? 0, travel.down ?? 0) || undefined;
      })(),
      grip:
        attachment.presentation.hand === "none" ? undefined : attachment.presentation.hand,
      closure: attachment.presentation.grip?.closure ?? "wrap",
    };
  }

  const bodyAsset = resolveAssetRef(config.parts.body);
  orientMeasuredGripSockets(sockets, bodyAsset, heldByHand);
  orientMeasuredFaceSockets(sockets, bodyAsset?.faceAxes);

  // Body-fit: torso surfaces for the configured body asset (pure data — no
  // asset-id conditionals). A mesh body ships measurements of itself and
  // those are used directly; a procedural body's are derived from its
  // params; a body declaring neither falls back to the classic ones.
  const bodyParams =
    bodyAsset?.source.kind === "procedural" ? (bodyAsset.source.params ?? {}) : {};
  const bodyProfile = deriveBodyProfile(
    bodyParams,
    config.proportions,
    bodyAsset?.bodyProfile
      ? {
          profile: bodyAsset.bodyProfile,
          morphs: config.morphs,
          torsoSurface: bodyAsset.torsoSurface,
          legEnvelope: bodyAsset.legEnvelope,
          skullEnvelope: bodyAsset.skullEnvelope,
        }
      : undefined,
  );


  /** This body's own joint table — see GeneratorContext.jointOffset. */
  const jointOffsetOf = (child: JointId): readonly [number, number, number] => {
    const joint = skeleton.joints.find((entry) => entry.id === child);
    return (joint?.position ?? getJoint(child).position) as readonly [number, number, number];
  };

  /**
   * Where a socket really is — see GeneratorContext.socketOffset.
   *
   * Off the live socket object, not the schema table and not the measured
   * profile: a part's GLB may already have moved it (see the SOCKET_
   * handling below), and the thing an ornament is parented to is this.
   */
  const socketOffsetOf = (id: SocketId): readonly [number, number, number] => {
    const socket = sockets.get(id);
    if (!socket) return [0, 0, 0];
    return [socket.position.x, socket.position.y, socket.position.z];
  };

  /**
   * Where a socket is, expressed in a named JOINT's frame.
   *
   * Because generators were re-deriving this from the joint table and
   * getting it wrong. The waist ornament hangs off the PELVIS; the belt
   * built on it converted to chest space as `socket - spine - chest`,
   * which is a different chain, and the answer was eighty millimetres
   * out. The belt was therefore built against the body profile at one
   * height and rendered at another, where the torso is wider — measured,
   * twenty-six millimetres of gold inside Shiva — and a body-derived
   * "floor" had been added to the belt's radius to push it back out,
   * which is what made it read as a flange on Ganesha, who did not need
   * the correction.
   *
   * Read off the live objects, so it is right whatever the skeleton's
   * shape and whoever reparented what: no generator should have to know
   * the chain between two things it can simply ask about.
   */
  const socketInFrameOf = (
    id: SocketId,
    frame: JointId,
  ): readonly [number, number, number] | null => {
    const socket = sockets.get(id);
    const joint = joints.get(frame);
    if (!socket || !joint) return null;
    socket.updateWorldMatrix(true, false);
    joint.updateWorldMatrix(true, false);
    const point = new THREE.Vector3().setFromMatrixPosition(socket.matrixWorld);
    joint.worldToLocal(point);
    return [point.x, point.y, point.z];
  };

  /**
   * How wide the figure has become, height by height AND bearing by
   * bearing, as clothing is put on it.
   *
   * Both axes are necessary. Binned by height alone, the widest worn
   * radius and the widest skin radius fall at different bearings and the
   * difference between them is not a gap anywhere — measured on Ganesha
   * it read five millimetres where the real answer was fourteen. A
   * wrapped thing is placed against the skin at each bearing, so what it
   * must clear is the largest excess at any one bearing.
   *
   * CLOTHING ONLY, which is not a shortcut. The question is "what am I
   * worn over", and in the rest pose the arms hang beside the waist: a
   * radius that included the body would report a hand at the hip and a
   * belt would be built to clear it. What wraps the figure is what a
   * wrapped thing has to clear, and the body's own surface is already
   * answered, per bearing, by `BodyProfile`.
   */
  const WORN_BIN = 0.005;
  const WORN_BEARINGS = 16;
  /**
   * Kept per GARMENT SLOT, because "what am I worn over" has a different
   * answer for different things and the single map could only give one.
   *
   * A kamarband is tied over the dhoti. The uttariya is thrown over the
   * shoulder and its tail falls across the belt — OVER it, the way cloth
   * laid on a belt does. Pooling both into one radius made the belt clear
   * the sash as well, and measured on Ganesha that put eighty millimetres
   * of air between the gold and the red: a flange standing further out
   * than his own belly, with its own shadow on the skirt below it. The
   * physics was never the problem; the belt was being told the wrong
   * thing was underneath it.
   */
  const wornRadius = new Map<string, Map<number, number>>();
  const wornKey = (heightBin: number, bearingBin: number): number =>
    heightBin * WORN_BEARINGS + bearingBin;
  const bearingBinOf = (x: number, z: number): number =>
    ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * WORN_BEARINGS) % WORN_BEARINGS) +
      WORN_BEARINGS) %
    WORN_BEARINGS;
  const recordWorn = (object: THREE.Object3D, slot: string): void => {
    const bySlot = wornRadius.get(slot) ?? new Map<number, number>();
    wornRadius.set(slot, bySlot);
    const point = new THREE.Vector3();
    object.updateWorldMatrix(true, true);
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute("position");
      if (!position) return;
      mesh.updateWorldMatrix(true, false);
      // Every third vertex: this runs on every rig build, and a garment's
      // widest point is a rim rather than a single vertex.
      for (let i = 0; i < position.count; i += 3) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        characterRoot.worldToLocal(point);
        const key = wornKey(Math.round(point.y / WORN_BIN), bearingBinOf(point.x, point.z));
        const radius = Math.hypot(point.x, point.z);
        if (radius > (bySlot.get(key) ?? 0)) bySlot.set(key, radius);
      }
    });
  };
  /**
   * WHERE THE CLOTH IS, as a SIGNED offset from the body's own surface —
   * or null where no cloth was recorded nearby.
   *
   * Signed, and that is the whole point of it. The clamped version can
   * only ever push a thing OUT from the profile's idea of the body, and
   * the profile is an estimate: measured on Ganesha it puts his belly at
   * a hundred and ninety-two millimetres at the front where the dhoti
   * drawn over it reaches a hundred and eighty-seven. A belt asking for
   * clearance there was told "none needed", fell back to a body-derived
   * floor, and came out thirty-one millimetres off the cloth — the flange
   * in the showcase captures.
   *
   * With the sign kept, a generator that seats itself at
   * `surfaceAt + offset` lands on the cloth that is ACTUALLY there, and
   * the profile's error cancels instead of accumulating. Null rather than
   * zero when nothing was found, so a caller can tell "the cloth is
   * exactly on the skin" from "there is no cloth here" — the two want
   * opposite fallbacks.
   */
  const wornOffsetAt = (
    frame: JointId,
    localY: number,
    bearing?: number,
    /**
     * The garment slots this thing is worn OVER. Omitted means every
     * garment, which is right for anything draped outermost and wrong
     * for anything tied under something else — see `wornRadius`.
     */
    over?: readonly string[],
  ): number | null => {
    const joint = joints.get(frame);
    const chestJoint = joints.get("chest" as JointId);
    if (!joint || !chestJoint || wornRadius.size === 0) return null;
    const layers = [...wornRadius.entries()]
      .filter(([slot]) => over === undefined || over.includes(slot))
      .map(([, bins]) => bins);
    if (layers.length === 0) return null;
    const wornAt = (key: number): number => {
      let widest = 0;
      for (const bins of layers) widest = Math.max(widest, bins.get(key) ?? 0);
      return widest;
    };
    joint.updateWorldMatrix(true, false);
    chestJoint.updateWorldMatrix(true, false);
    const at = new THREE.Vector3(0, localY, 0).applyMatrix4(joint.matrixWorld);
    const chestLocalY = at
      .clone()
      .applyMatrix4(new THREE.Matrix4().copy(chestJoint.matrixWorld).invert()).y;
    characterRoot.worldToLocal(at);
    const heightBin = Math.round(at.y / WORN_BIN);

    const probe = new THREE.Vector3();
    let widestWorn = 0;
    let found = false;
    /**
     * ONE BEARING WHEN ONE IS ASKED FOR.
     *
     * Taking the worst over the whole circle is right for something that
     * must clear everything at once, and wrong for a ribbon that is
     * placed bearing by bearing. Measured: a sash crosses the belt at a
     * single point, and the belt bulged its ENTIRE circumference to clear
     * it -- forty-five millimetres of air all the way round for one
     * crossing, which is what made it read as a gold tray.
     */
    const centre = bearing === undefined ? 0 : bearingBinOf(Math.sin(bearing), Math.cos(bearing));
    /**
     * A WINDOW, not a single bin, because the things that read this are
     * rigid. A metal belt cannot scallop in and out bin by bin to follow
     * a sash crossing under it; it swells over an arc and comes back.
     * Two bins either side is forty-five degrees of arc, which is about
     * what a band bends over.
     */
    const WINDOW = 2;
    const first = bearing === undefined ? 0 : centre - WINDOW;
    const last = bearing === undefined ? WORN_BEARINGS - 1 : centre + WINDOW;
    for (let raw = first; raw <= last; raw += 1) {
      const step = ((raw % WORN_BEARINGS) + WORN_BEARINGS) % WORN_BEARINGS;
      const bearing = (step / WORN_BEARINGS) * Math.PI * 2;
      // One height bin either side: a height is a slice, and a slice that
      // falls between two samples of a pleated hem should not read as
      // nothing.
      const worn = Math.max(
        wornAt(wornKey(heightBin - 1, step)),
        wornAt(wornKey(heightBin, step)),
        wornAt(wornKey(heightBin + 1, step)),
      );
      if (worn <= 0) continue;
      found = true;
      widestWorn = Math.max(widestWorn, worn);
    }
    if (!found) return null;
    /**
     * THE WIDEST CLOTH IN THE ARC, against the skin AT THE BEARING ASKED.
     *
     * The window used to be applied to the finished clearance — the
     * largest `worn - surfaceAt` anywhere in the arc — and that mixes two
     * bearings into one number. Measured on Ganesha: at ninety degrees
     * the body is a hundred and eighty millimetres and the dhoti a
     * hundred and eighty-seven, so the belt needs seven; but a hundred
     * and thirty-five degrees is inside the window, the body there is a
     * hundred and sixty-three, and the twenty-four millimetres THAT
     * bearing needs was carried round and applied where it was not. The
     * belt came out thirty-four millimetres off the cloth on both flanks.
     *
     * A radius is the thing that travels. A rigid band bending over an
     * arc must pass outside the widest cloth in that arc — and it does so
     * at its own bearing, where its own skin is.
     */
    const point = bodyProfile.surfaceAt(
      bearing === undefined ? 0 : bearing,
      chestLocalY,
    );
    probe.set(point.x, point.y, point.z).applyMatrix4(chestJoint.matrixWorld);
    characterRoot.worldToLocal(probe);
    return widestWorn - Math.hypot(probe.x, probe.z);
  };

  /**
   * How far past the body's own surface the cloth reaches here, or zero
   * where it does not reach past it at all.
   *
   * The clamped answer, which is what anything asking "how much room do I
   * need to clear what is under me" wants.
   */
  const wornClearanceAt = (
    frame: JointId,
    localY: number,
    bearing?: number,
    over?: readonly string[],
  ): number => Math.max(0, wornOffsetAt(frame, localY, bearing, over) ?? 0);

  const baseCtx: Omit<GeneratorContext, "params"> = {
    jointOffset: jointOffsetOf,
    socketOffset: socketOffsetOf,
    socketInFrame: socketInFrameOf,
    wornClearanceAt,
    wornOffsetAt,
    materials,
    proportions: config.proportions,
    morphs: config.morphs,
    hands,
    arms: config.arms,
    armSlots,
    held: heldByHand,
    seated: resolved.pose.seated,
    garment: resolved.pose.garment,
    body: bodyProfile,
  };
  const ctxFor = (asset: AssetDefinition): GeneratorContext => ({
    ...baseCtx,
    params: asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {},
  });

  // Parts. Socket-mounted part entries (ear jewellery etc.) are deferred
  // until every joint entry has landed, so owner parts have already
  // refined the sockets they terminate on.
  const socketMounts: Array<{
    assetId: string;
    socket: SocketId;
    object: THREE.Object3D;
    /** What it is, so cloth can be recorded once it is in the tree. */
    category: string;
    slot: string;
  }> = [];
  /**
   * THE FIGURE'S OWN FLESH — all of it, not only the torso slot.
   *
   * This used to be the `body` slot alone, because its one job was to
   * decide what the statue rests on and a hem that hangs past the feet
   * must not lift it off its base. That job is still here and still
   * right. But four questions read this set, and three of them want the
   * whole figure:
   *
   *   • what the statue rests on              — the lowest flesh
   *   • how wide a planted staff must clear   — ALL of it, including a head
   *   • how tall the figure is                — including its head
   *   • whether there is a figure yet         — any of it
   *
   * And a fifth, which is why this changed: every depth measurement in
   * the suite asks this set what "inside the figure" means. On Ganesha it
   * answered with a torso. His HEAD, ears, tusks, trunk and hands were
   * not in it, so his crown, his earrings and his tilaka were measured
   * against a body that does not include the thing they are worn on, and
   * reported a crown a hundred and forty-nine millimetres from "the
   * body" — which was the measurement failing, not the crown.
   *
   * Named by slot rather than by material, so it is a list somebody
   * decided rather than a property that could drift: a garment is not
   * flesh however it is coloured, and brows are a variant worn ON a face
   * and stay measurable against it.
   */
  const bodyMeshes: THREE.Mesh[] = [];
  const claimFlesh = (object: THREE.Object3D): void => {
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) bodyMeshes.push(mesh);
    });
  };
  /**
   * IN THE ORDER THE SLOTS ARE DECLARED, not the order the object happens
   * to carry.
   *
   * `PART_SLOTS` lists the lower garment before the upper one, which IS
   * the layering: a sash goes over a skirt. Reading `Object.entries` got
   * the same answer by luck, because the defaults are written in that
   * order — and a configuration that has been through JSON, a share link
   * or an editor that rebuilt the record need not keep it. Now that a
   * later part can ask what an earlier one is wearing, the order is load
   * bearing and it comes from the declaration.
   */
  const partEntries = PART_SLOTS.flatMap((slot) =>
    slot in config.parts ? ([[slot, config.parts[slot]]] as Array<[string, unknown]>) : [],
  );
  for (const [slot, ref] of partEntries as Array<[string, (typeof config.parts)[PartSlot]]>) {
    const asset = resolveAssetRef(ref);
    if (ref && !asset) {
      warnings.push(`Unknown part asset: ${ref.assetId}`);
      continue;
    }
    if (!asset) continue;
    if (resolved.integratedFeatures.has(slot) && !asset.integratedFeatures?.includes(slot)) continue;
    const isFlesh = FLESH_SLOTS.has(slot);
    const renderable = resolveRenderable(asset, ctxFor(asset), warnings, pending);
    if (!renderable) continue;
    if (renderable instanceof THREE.Object3D) {
      // Asset-spec socket contract: SOCKET_<id> empties inside the GLB
      // refine the schema socket's position to the authored location.
      // Runs before any re-parenting, while the GLB hierarchy is intact.
      renderable.traverse((node) => {
        const socketName = node.name.match(/^SOCKET_(.+)$/)?.[1];
        if (!socketName) return;
        const socketId = socketNameToSocketId(socketName);
        const socket = socketId ? sockets.get(socketId) : undefined;
        const parentJoint = socket?.parent;
        if (!socket || !parentJoint) {
          warnings.push(`Asset ${asset.id}: unknown socket in node "${node.name}"`);
          return;
        }
        node.updateWorldMatrix(true, false);
        parentJoint.updateWorldMatrix(true, false);
        socket.position.copy(
          parentJoint.worldToLocal(node.getWorldPosition(new THREE.Vector3())),
        );
      });

      // Skinned GLB contract: one continuous mesh whose bones are named
      // after joint ids. The mesh is re-bound to THIS rig's joints, so the
      // existing pose system deforms it on the GPU. Skinned meshes carry
      // their own vertex placement — glTF ignores the node transform — so
      // they mount on the character root at identity.
      const skinnedMeshes = collectSkinnedMeshes(renderable);
      if (skinnedMeshes.length > 0) {
        for (const mesh of skinnedMeshes) {
          mesh.name = mesh.name || `part:${asset.id}`;
          if (isFlesh) bodyMeshes.push(mesh);
          characterRoot.add(mesh);
          mesh.position.set(0, 0, 0);
          mesh.quaternion.identity();
          mesh.scale.set(1, 1, 1);
          bindSkinnedMeshToJoints(mesh, joints, characterRoot, warnings, `Asset ${asset.id}`);
        }
        continue;
      }

      // GLB part contract: groups named JOINT_<jointId> (searched at any
      // wrapper depth — exporters add scene/aux wrappers) are re-parented
      // onto that joint, so the part articulates with the skeleton.
      const jointGroups: THREE.Object3D[] = [];
      renderable.traverse((node) => {
        if (/^JOINT_(.+)$/.test(node.name)) jointGroups.push(node);
      });
      let mapped = 0;
      for (const group of jointGroups) {
        const jointId = group.name.slice("JOINT_".length);
        if (isJointId(jointId)) {
          const target = joints.get(jointId as JointId);
          // Named like a procedural part, because everything that reports
          // on the scene identifies pieces by this name. Unnamed, a GLB
          // head appeared in every measurement as "(anon)head_classicSculpt"
          // -- the exporter's node name -- and could not be traced back to
          // the asset a customer chose.
          group.name = group.name.startsWith("part:") ? group.name : `part:${asset.id}`;
          target?.add(group);
          if (isFlesh) claimFlesh(group);
          // A head part replaces the body's own head, so it replaces the
          // measurements that describe it. See measureCranium: Ganesha's
          // default head is a GLB, which is why this is measured off the
          // geometry rather than declared anywhere.
          if (slot === "head" && jointId === "head" && target) {
            const cranium = measureCranium(group, target);
            if (cranium) {
              Object.assign(bodyProfile, cranium);
              const crownSocket = sockets.get("head.crown" as SocketId);
              if (crownSocket) crownSocket.position.y = cranium.crownSocketY;
            }
          }
          // And hair GROWS on the head, so anything worn round the head
          // has to go round it. See skullEnvelopeWith.
          if (slot === "hair" && jointId === "head" && target) {
            const grown = skullEnvelopeWith(bodyProfile.skullAt, group, target);
            if (grown) bodyProfile.headEnvelopeAt = grown;
          }
          mapped += 1;
        } else {
          warnings.push(`Asset ${asset.id}: unknown joint in group "${group.name}"`);
        }
      }
      if (mapped === 0) {
        warnings.push(
          `Asset ${asset.id}: GLB part has no JOINT_<id> groups; attached to character root`,
        );
        characterRoot.add(renderable);
      }
      continue;
    }
    for (const entry of renderable.jointed) {
      entry.object.name = entry.object.name || `part:${asset.id}`;
      if (isFlesh) claimFlesh(entry.object);
      if (entry.socket !== undefined) {
        socketMounts.push({
          assetId: asset.id,
          socket: entry.socket,
          object: entry.object,
          category: asset.category,
          slot,
        });
      } else {
        const target = joints.get(entry.joint);
        if (!target) {
          warnings.push(`Asset ${asset.id}: unknown joint ${entry.joint}`);
          continue;
        }
        target.add(entry.object);
        // Now it is in the tree, so how wide it makes the figure can be
        // read. Ornaments worn over it are built later and ask.
        if (asset.category === "clothing") recordWorn(entry.object, slot);
      }
      /**
       * A part that REPLACED a region of the body corrects what the
       * profile says about it, before anything worn there is generated.
       *
       * Parts build before attachments, so a crown asking `headRadius`
       * gets the head that is actually on the figure rather than the one
       * the body asset would have drawn. Applied in place, because there
       * is one profile and a second copy of it is a second answer.
       */
      /**
       * A head part replaces the body's own head, so it also replaces the
       * measurements that describe it — before anything worn on a head is
       * generated. Parts build before attachments, so a crown asking
       * `headRadius` gets the cranium that is actually on the figure.
       *
       * Applied in place: there is one profile, and a second copy of it
       * would be a second answer.
       */
      if (slot === "head" && entry.joint === "head") {
        const headJoint = joints.get("head" as JointId);
        const cranium = headJoint ? measureCranium(entry.object, headJoint) : null;
        if (cranium) {
          Object.assign(bodyProfile, cranium);
          const crownSocket = sockets.get("head.crown" as SocketId);
          if (crownSocket) crownSocket.position.y = cranium.crownSocketY;
        }
      }
      // And hair GROWS on the head, so anything worn round the head has
      // to go round it. See skullEnvelopeWith.
      if (slot === "hair" && entry.joint === "head") {
        const headJoint = joints.get("head" as JointId);
        const grown = headJoint
          ? skullEnvelopeWith(bodyProfile.skullAt, entry.object, headJoint)
          : null;
        if (grown) bodyProfile.headEnvelopeAt = grown;
      }
      // The part owns the surface its sockets terminate on (e.g. the
      // trunk's tip, or a hand's own grip) — move those sockets onto the
      // generated geometry, and aim them if the part says which way a
      // held shaft runs through them.
      for (const refinement of entry.socketRefinements ?? []) {
        const socket = sockets.get(refinement.id);
        if (!socket) continue;
        socket.position.set(...refinement.position);
        if (refinement.channel) {
          aimSocket(
            socket,
            new THREE.Vector3(...refinement.channel),
            new THREE.Vector3(...(refinement.palm ?? [0, 0, 1])),
          );
        }
      }
    }
  }

  // Every part has refined the sockets it owns; now that the hand's own
  // grip socket is where the GLB says it is, seat what the hand holds on
  // the palm rather than in the middle of the hole the fist makes.
  seatMeasuredGrips(sockets, bodyAsset, heldByHand);

  for (const mount of socketMounts) {
    const socket = sockets.get(mount.socket);
    if (!socket) {
      warnings.push(`Asset ${mount.assetId}: unknown socket ${mount.socket}`);
      continue;
    }
    socket.add(mount.object);
    /**
     * A GARMENT MOUNTED TO A SOCKET IS STILL CLOTH ON THE FIGURE.
     *
     * Only the joint-parented branch recorded, so a dhoti that hangs off
     * a socket was invisible to everything asking "what am I worn over".
     * Measured on the stylised Shiva: the skirt reached three hundred and
     * thirty millimetres across and the belt tied over it came out at two
     * hundred and seventy-three — the gold entirely inside the cloth,
     * because as far as the measurement was concerned there was no cloth.
     *
     * Recorded here rather than at the push, because a mount's world
     * matrix only means anything once it is under the socket.
     */
    if (mount.category === "clothing") recordWorn(mount.object, mount.slot);
  }

  // Attachments — every decision about where these go and in what
  // presentation was already made by the resolver.
  for (const attachment of resolved.attachments) {
    const { asset, presentation } = attachment;
    const socket = sockets.get(attachment.socket);
    if (!socket) {
      warnings.push(`Attachment ${asset.id}: unknown socket ${attachment.socket}`);
      continue;
    }
    const renderable = resolveRenderable(asset, ctxFor(asset), warnings, pending);
    if (!renderable || !(renderable instanceof THREE.Object3D)) continue;
    renderable.name = `attachment:${asset.id}`;
    applyAttachmentTransforms(renderable, presentation, attachment);
    socket.add(renderable);

    if (isHandheld(presentation) && attachment.handSlot && presentation.orientation === "worldUpright") {
      // The hand is turned onto the item. That is the whole mechanism:
      // the item then sits in the grip exactly as its declared frame says,
      // and the relationship is rig-relative all the way down.
      held.push({
        slot: attachment.handSlot,
        // The item's own axis has already been carried onto the socket's
        // +Y by the grip frame, so what must be made vertical is the
        // socket's channel.
        axis: [0, 1, 0],
      });
      if (presentation.facing === "front") {
        faced.push({ object: renderable, channel: presentation.grip?.axis ?? [0, 1, 0] });
      }
    }

    if (standsOnGround(presentation)) {
      let standsAt: { side: number; clearanceM: number } | undefined;
      if (!attachment.handSlot) {
        // Standing on its own: beside the figure, clear of it.
        //
        // Clear of the BODY, at the gap the presentation declares — not
        // wherever the hand that used to hold it has since travelled. The
        // hand only chooses the side. Following the hand's own position
        // put the staff through a raised abhaya arm, because a blessing
        // hand is a third of a metre further out than a hanging one and a
        // set-down staff does not follow it there.
        const requested = sockets.get(attachment.requestedSocket);
        requested?.updateWorldMatrix(true, false);
        const wouldHaveBeen = requested?.getWorldPosition(new THREE.Vector3());
        const silhouette = Math.max(
          bodyProfile.dhotiRadius,
          bodyProfile.pelvisHalfWidth,
          bodyProfile.chestRadiusX,
        );
        const clear = silhouette + (presentation.stand?.clearanceM ?? 0.045);
        const side =
          wouldHaveBeen && wouldHaveBeen.x !== 0
            ? Math.sign(wouldHaveBeen.x)
            : presentation.stand?.side === "left"
              ? 1
              : -1;
        // The profile's answer, which is right for a figure standing up
        // and is refined against the posed skin once there is a pose —
        // see `standClear` in settlePlantedAttachments.
        renderable.position.x = side * clear;
        renderable.position.z = 0;
        standsAt = { side, clearanceM: presentation.stand?.clearanceM ?? 0.045 };
      }
      const frame = resolveGripFrame(presentation);
      planted.push({
        object: renderable,
        rest: renderable.position.clone(),
        buttBelowAnchor: buttBelowAnchor(renderable),
        baseTop,
        axis: new THREE.Vector3(0, 1, 0),
        travel: attachment.handSlot
          ? frame.travel
          : // Nothing is holding it, so nothing limits where it stands.
            { up: Number.POSITIVE_INFINITY, down: Number.POSITIVE_INFINITY },
        stand: standsAt,
      });
    }
  }

  // Base platform; the character stands on its top surface.
  const baseBuilder = BASE_BUILDERS[config.base.style];
  if (baseBuilder) {
    const base = baseBuilder({ ...baseCtx, params: {} });
    base.name = `base:${config.base.style}`;
    root.add(base);
  }
  characterRoot.position.y = baseTop;

  // Whole-statue height proportion (uniform so nothing distorts).
  root.scale.setScalar(config.proportions.height);

  // Morph weights for assets that expose morph targets (GLB/skinned).
  // Procedural generators consumed the same weights parametrically above.
  // The customer's weights are not all of them: a modelled hand closes by
  // deformation, onto the radius the thing it holds declares.
  applyMorphInfluences(
    root,
    morphInfluences(config.morphs, hands, bodyAsset, heldByHand),
  );

  // What the resolver could not honour is a rig warning too — one list,
  // so nothing is reported in a place nobody reads.
  for (const issue of resolved.issues) {
    if (issue.severity !== "note") warnings.push(issue.message);
  }

  return {
    root,
    baseTop,
    bodyMeshes,
    skeleton,
    joints,
    sockets,
    resolved,
    planted,
    hands,
    held,
    faced,
    body: bodyProfile,
    bodyAsset,
    heldByHand,
    warnings,
    pending,
    poseWarnings: [],
  };
}

const worldQuaternion = new THREE.Quaternion();
const plantedPoint = new THREE.Vector3();
const worldFace = new THREE.Vector3();

/**
 * Spend the free spin of every facing-declared held item.
 *
 * The upright solve turned the hand so the item's channel is vertical;
 * what it could not choose is the spin about that channel, which landed
 * wherever the wrist did — pose-dependent, and for an item with a face,
 * visibly wrong (the discus caught half-profile). So: measure where the
 * item's +Z actually looks, project out the channel's component, and
 * counter-spin about the channel until it looks out the statue's front.
 * A correction measured from the world converges instead of accumulating,
 * and a rotation about the grip channel is invisible to the grip.
 */
function faceHeldItems(rig: CharacterRig): void {
  for (const { object, channel } of rig.faced) {
    object.updateWorldMatrix(true, false);
    worldFace.set(0, 0, 1).transformDirection(object.matrixWorld);
    // Only the component the spin can move: the horizontal one, because
    // the channel the item spins about has just been made vertical.
    worldFace.y = 0;
    if (worldFace.lengthSq() < 1e-8) continue; // face along the channel — nothing to spend
    const yaw = Math.atan2(worldFace.x, worldFace.z); // signed angle from world +Z
    object.rotateOnAxis(new THREE.Vector3(...channel).normalize(), -yaw);
  }
}

/**
 * Settle planted attachments after a pose change.
 *
 * Nothing here is a world-space orientation override — that mechanism is
 * gone. An item's orientation comes from the grip chain: the asset's frame
 * onto the socket's channel, and the hand turned so that channel points
 * where the presentation says the item must run.
 *
 * What remains is a POSITION relationship, and a real one: a staff whose
 * weight is on the ground slides along its OWN axis until its butt meets
 * the base, so raising the arm carries the hand up the shaft rather than
 * lifting the whole weapon. The slide is bounded by the travel the asset
 * declares, because a shaft stops being shaft where the trident begins.
 */
export function settlePlantedAttachments(rig: CharacterRig): void {
  // Measured once per settle, and only when something actually stands on
  // its own beside the figure.
  let reach: number | null = null;
  const bodyReach = (): number => {
    if (reach === null) reach = standClear(rig);
    return reach;
  };

  for (const { object, rest, buttBelowAnchor: drop, baseTop, axis, travel, stand } of rig.planted) {
    const parent = object.parent;
    if (!parent) continue;
    parent.updateWorldMatrix(true, false);
    const anchor = rig.root.worldToLocal(parent.getWorldPosition(plantedPoint));
    parent.getWorldQuaternion(worldQuaternion);
    // How far short of the base the butt currently falls, measured along
    // the axis the item is presented on.
    const shortfall = (baseTop + drop - anchor.y) / (axis.y !== 0 ? axis.y : 1);
    // A hand can only slide as far as there is shaft to slide on. Sliding
    // the item DOWN carries the grip UP toward the head, so a negative
    // shortfall is bounded by travel.up. Past that the butt leaves the
    // ground, which is the honest failure: better a staff that hovers than
    // a fist closed around a trident's prongs.
    const slide = Math.min(travel.down, Math.max(-travel.up, shortfall));
    object.position
      .copy(axis)
      .multiplyScalar(slide)
      .applyQuaternion(worldQuaternion.invert())
      .add(rest);

    // And out far enough to be BESIDE the figure in the pose it is in.
    //
    // Where it stands was decided at build time from the body profile,
    // which describes a figure standing up. A pose that folds the legs
    // out sideways reaches half again as far as any profile measurement,
    // and the trishul set down beside a meditating Shiva stood in his
    // thigh. The profile's answer is kept as the floor — a staff never
    // moves closer than it — and the posed skin pushes it out from there.
    if (stand) {
      const wanted = stand.side * Math.max(Math.abs(rest.x), bodyReach() + stand.clearanceM);
      object.position.x += wanted - rest.x;
    }
  }
}

/**
 * How far the POSED figure reaches sideways, in statue-root metres.
 *
 * The skin only. Cloth pools and a garment's hem is not something a staff
 * has to stand clear of; ornaments are on the skin already. Walked with a
 * stride, because this answers a question asked in centimetres and a
 * fourteen-thousand-vertex body says the same thing at every seventh
 * vertex.
 */
function standClear(rig: CharacterRig): number {
  const point = new THREE.Vector3();
  let widest = 0;
  for (const mesh of rig.bodyMeshes) {
    const position = mesh.geometry?.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const stride = Math.max(1, Math.floor(position.count / 2000));
    for (let vertex = 0; vertex < position.count; vertex += stride) {
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        deformedVertex(mesh, vertex, point).applyMatrix4(mesh.matrixWorld);
      } else {
        point.fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
      }
      const across = Math.abs(rig.root.worldToLocal(point.clone()).x);
      if (across > widest) widest = across;
    }
  }
  return widest;
}

/**
 * Rest the figure on its support.
 *
 * A pose used to carry an authored root offset: `rootOffset: [0, -0.2, 0]`
 * on every seated preset, typed against the body those presets were
 * written for. On any other body it is wrong by however much that body
 * differs — which is why the meditating figure levitated a hand's breadth
 * above its own base, and why the standing one hovered thirteen
 * millimetres over it.
 *
 * A body resting on something touches it. That is the whole statement,
 * and it is measurable: the lowest point of the body, in the pose it is
 * actually in, is placed on the support. Nothing is authored, and no
 * landmark stands in for the geometry — a padmasana ankle rolls its sole
 * skyward and touches on the side of the foot, which no offset below a
 * joint can describe.
 *
 * The BODY, not what it wears: cloth pools on the floor beside a seated
 * figure without holding it up, and a hem that reached lower than the
 * feet would lift the whole statue off its base.
 */
export function settleOnSupport(rig: CharacterRig): void {
  const root = rig.joints.get("root");
  if (!root || rig.bodyMeshes.length === 0) return;
  rig.root.updateWorldMatrix(true, true);

  const point = new THREE.Vector3();
  let lowest = Number.POSITIVE_INFINITY;
  for (const mesh of rig.bodyMeshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i);
      if (skinned) skinned.applyBoneTransform(i, point);
      point.applyMatrix4(mesh.matrixWorld);
      rig.root.worldToLocal(point);
      if (point.y < lowest) lowest = point.y;
    }
  }
  if (!Number.isFinite(lowest)) return;

  root.position.y += rig.baseTop - lowest;
  rig.root.updateWorldMatrix(true, true);
}

/**
 * Dispose geometries owned by a rig. Shared resources survive: zone/fixed
 * materials, and GLB geometry (owned by the glbCache source scene, flagged
 * via userData.glbShared).
 */
export function disposeRig(rig: CharacterRig): void {
  rig.root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.glbShared !== true) {
      object.geometry.dispose();
    }
  });
}

/**
 * Which way a hand's grip channel runs, in that hand's own frame.
 *
 * Read back off the socket the rig aimed, so there is exactly one
 * statement of it in the system: the hand geometry aims its socket, and
 * everything that needs the channel asks the socket.
 */
export function handGripChannel(rig: CharacterRig, slot: ArmSlot): THREE.Vector3 {
  const socket = rig.sockets.get(`arm.${slot}.hand.item` as SocketId);
  return new THREE.Vector3(0, 1, 0).applyQuaternion(
    socket?.quaternion ?? new THREE.Quaternion(),
  );
}

/**
 * Pose the rig: joints, gestures, grips, and planted attributes settled.
 *
 * One ordering, in one place. It used to live in three call sites that
 * each had to remember it — and a call site that forgot to settle the
 * planted items left a trishul hanging in the air.
 *
 * THE POSE IS AN ARGUMENT, not a property of the rig. A rig is built for
 * a structure — which body, which attributes, which arms — and a joint
 * the customer bends changes none of those, so the rig is not rebuilt for
 * it. This used to re-apply `rig.resolved.pose`, the pose as it stood the
 * moment the rig was built, which meant every bend of a knee or twist of
 * a torso re-asserted the pose the customer was trying to change and the
 * sliders moved nothing. Callers pass the pose they want applied; the
 * pose the rig was built with is only the default.
 */
export function poseRig(rig: CharacterRig, pose?: PoseConfiguration): HandSolution[] {
  applyPose(
    rig.joints,
    pose ?? {
      preset: rig.resolved.pose.presetId,
      jointOverrides: rig.resolved.pose.joints as Record<string, Vec3>,
    },
  );
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
  rig.poseWarnings.length = 0;

  const gestures = applyGestureOrientations(rig.joints, rig.hands);
  for (const gesture of unreachableGrips(gestures)) {
    rig.poseWarnings.push(
      `Gesture: the ${gesture.slot} arm cannot show ${rig.hands[gesture.slot].mudra} ` +
        `in this pose (${degrees(gesture.residual)}° out).`,
    );
  }

  // Hands holding something are turned onto it before anything is settled,
  // or the item lands between the fingers instead of through the fist.
  const grips = applyGripOrientations(rig.joints, rig.held, (slot) =>
    handGripChannel(rig, slot),
  );
  for (const grip of unreachableGrips(grips)) {
    rig.poseWarnings.push(
      `Grip: the ${grip.slot} hand cannot present its attribute upright in this pose ` +
        `(${degrees(grip.residual)}° out).`,
    );
  }

  // The upright solve fixes the channel and leaves the spin about it
  // wherever the wrist landed. Items that declared a facing spend that
  // spin now, after the hands have been turned onto them.
  faceHeldItems(rig);

  // What closes a hand is the hand's own grip morph, and nothing else.
  //
  // There was a finger solver here that rotated the three joints of each
  // finger onto the object after the morph had already closed the hand.
  // Two closure systems on one hand, neither able to see the other: the
  // morph moves skin without moving bones, so the solver measured an open
  // chain, decided it could not reach, and applied its whole budget to
  // every finger — on top of a fist that was already shut. The Studio
  // showed what that produces, and a hand with the solver switched off
  // measured closer to the shaft than one with it on.
  //
  // The morph is the better instrument in any case. It is baked offline
  // by the body itself, from the full-resolution hand its author rigged,
  // and the runtime rig has three joints per finger and no correctives.
  // What the engine has to get right is which shape, and how far — see
  // handMorphInfluences and the radii the body baked them at.

  // The figure meets its base before anything else is settled against the
  // ground — a staff plants itself relative to a support the figure is
  // already resting on, not to one it is about to move onto.
  settleOnSupport(rig);

  // The arm has moved; only now is it known where a planted staff's hand
  // ended up, and therefore how far it has to slide to reach the ground.
  settlePlantedAttachments(rig);
  return [...gestures, ...grips];
}

/** Verify every socket of the rig's skeleton exists on the built rig. */
export function assertRigIntegrity(rig: CharacterRig): void {
  for (const socket of rig.skeleton.sockets) {
    if (!rig.sockets.has(socket.id)) {
      throw new Error(`Rig integrity: missing socket ${socket.id} (${socket.label})`);
    }
  }
}
