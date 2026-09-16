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
  isJointId,
  type ArmSlot,
  type CharacterConfiguration,
  type HandsConfiguration,
  type JointId,
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

function orientMeasuredGripSockets(
  sockets: Map<SocketId, THREE.Object3D>,
  gripAxes: Readonly<Record<string, readonly [number, number, number]>> | undefined,
): void {
  if (!gripAxes) return;
  for (const slot of ARM_SLOTS) {
    const measured = gripAxes[slot];
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
  seats: AssetDefinition["gripSeats"],
  held: Readonly<Partial<Record<ArmSlot, HeldItemSpec>>>,
): void {
  if (!seats) return;
  for (const slot of ARM_SLOTS) {
    const seat = seats[slot];
    const radius = held[slot]?.radius;
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
  const root = new THREE.Group();
  root.name = "statueRoot";
  const baseTop = BASE_TOP_HEIGHT[config.base.style] ?? 0;
  const { characterRoot, joints } = buildJointHierarchy(skeleton);
  root.add(characterRoot);
  const sockets = buildSockets(skeleton, joints, root, baseTop);

  const bodyAsset = resolveAssetRef(config.parts.body);
  orientMeasuredGripSockets(sockets, bodyAsset?.gripAxes);

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
        }
      : undefined,
  );

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
    };
  }

  const baseCtx: Omit<GeneratorContext, "params"> = {
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
  const socketMounts: Array<{ assetId: string; socket: SocketId; object: THREE.Object3D }> = [];
  // The flesh: what the statue rests on its base with. Collected as the
  // parts are mounted, because only here is it known which geometry came
  // from the body slot and which from something worn over it.
  const bodyMeshes: THREE.Mesh[] = [];
  const claimFlesh = (object: THREE.Object3D): void => {
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) bodyMeshes.push(mesh);
    });
  };
  for (const [slot, ref] of Object.entries(config.parts)) {
    const asset = resolveAssetRef(ref);
    if (ref && !asset) {
      warnings.push(`Unknown part asset: ${ref.assetId}`);
      continue;
    }
    if (!asset) continue;
    if (resolved.integratedFeatures.has(slot) && !asset.integratedFeatures?.includes(slot)) continue;
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
          if (slot === "body") bodyMeshes.push(mesh);
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
          joints.get(jointId as JointId)?.add(group);
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
      if (slot === "body") claimFlesh(entry.object);
      if (entry.socket !== undefined) {
        socketMounts.push({ assetId: asset.id, socket: entry.socket, object: entry.object });
      } else {
        const target = joints.get(entry.joint);
        if (!target) {
          warnings.push(`Asset ${asset.id}: unknown joint ${entry.joint}`);
          continue;
        }
        target.add(entry.object);
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
  seatMeasuredGrips(sockets, bodyAsset?.gripSeats, heldByHand);

  for (const mount of socketMounts) {
    const socket = sockets.get(mount.socket);
    if (!socket) {
      warnings.push(`Asset ${mount.assetId}: unknown socket ${mount.socket}`);
      continue;
    }
    socket.add(mount.object);
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
    }

    if (standsOnGround(presentation)) {
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
        renderable.position.x = side * clear;
        renderable.position.z = 0;
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
  for (const { object, rest, buttBelowAnchor: drop, baseTop, axis, travel } of rig.planted) {
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
  }
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
 */
export function poseRig(rig: CharacterRig): HandSolution[] {
  applyPose(rig.joints, {
    preset: rig.resolved.pose.presetId,
    jointOverrides: rig.resolved.pose.joints as Record<string, Vec3>,
  });
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
