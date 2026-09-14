/**
 * Rig builder.
 *
 * Builds the character's joint hierarchy (real THREE.Object3D transforms —
 * the same articulation model a GLB skeleton maps onto), populates part
 * meshes onto joints, creates sockets and mounts attachments.
 *
 * The rig is rebuilt when structure changes (parts/attachments/morphs/
 * hands/arms); pose and materials are applied in place without rebuilding
 * (see pose.ts / materials.ts).
 */
import * as THREE from "three";
import {
  activeArmSlots,
  getPosePreset,
  getSkeleton,
  isJointId,
  type CharacterConfiguration,
  type JointId,
  type SkeletonDefinition,
  type SocketId,
} from "@devaform/character-schema";
import { getAvailableDeity, resolveAssetRef, type AssetDefinition } from "@devaform/asset-system";
import {
  ATTACHMENT_GENERATORS,
  BASE_BUILDERS,
  BASE_TOP_HEIGHT,
  PART_GENERATORS,
  deriveBodyProfile,
  type BodyProfile,
  type GeneratorContext,
} from "./generators";
import { getGlb, instantiateGlb } from "./glbCache";
import {
  applyMorphInfluences,
  bindSkinnedMeshToJoints,
  collectSkinnedMeshes,
  socketNameToSocketId,
} from "./skinning";
import type { ZoneMaterials } from "./materials";
import type { HeldItem } from "./pose";

export interface CharacterRig {
  root: THREE.Group;
  /** The skeleton this rig was built from — the body's, or the deity's. */
  skeleton: SkeletonDefinition;
  joints: ReadonlyMap<JointId, THREE.Object3D>;
  sockets: ReadonlyMap<SocketId, THREE.Object3D>;
  /** Attachments that must stay world-upright after every pose change. */
  uprightAttachments: THREE.Object3D[];
  /**
   * Planted attachments: a staff stands on the ground whatever the hand
   * does, so when a pose lifts the hand the hand slides up the shaft
   * rather than carrying the whole weapon into the air.
   */
  groundedAttachments: Array<{ object: THREE.Object3D; reach: number; baseTop: number }>;
  /**
   * What each hand is holding, and which way the item runs in the world.
   * The hand has to be TURNED onto it — see applyGripOrientations — or
   * the item ends up lying between the fingers instead of in the fist.
   */
  held: HeldItem[];
  /**
   * Torso surfaces this rig's body-fitted geometry was built against —
   * measured from a mesh body, or derived from a procedural one.
   */
  body: BodyProfile;
  /** Assets that failed to resolve or are still loading (not fatal). */
  warnings: string[];
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
): THREE.Object3D | { jointed: ReturnType<(typeof PART_GENERATORS)[string]> } | null {
  if (asset.source.kind === "glb") {
    const entry = getGlb(asset.source.path);
    if (entry.status === "loaded") return instantiateGlb(entry.scene, ctx.materials);
    if (entry.status === "error") warnings.push(`Asset ${asset.id}: ${entry.message}`);
    return null; // still loading — a cache subscriber rebuild will pick it up
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
 * Resolve an asset's declared grip frame into the local transform that
 * puts its grip origin on the socket with its grip axis running up the
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
  asset: AssetDefinition,
  socketId: string,
  offset:
    | {
        position?: readonly [number, number, number];
        rotation?: readonly [number, number, number];
        scale?: number;
      }
    | undefined,
): void {
  // Grip frame first: align the asset's declared grip origin/axis with
  // the socket's grip channel. Identity for assets authored in DevaForm's
  // default convention, so this only reorients assets that declare it.
  if (asset.grip && (asset.grip.origin || asset.grip.axis || asset.grip.roll)) {
    const frame = gripFrameTransform(asset.grip);
    object.quaternion.copy(frame.quaternion);
    object.position.copy(frame.position);
  }
  // Per-socket calibration wins over the default (a modak in the trunk
  // needs a different transform than a modak in a palm). Calibration is
  // ADDITIVE on top of the grip frame.
  const dt = asset.socketTransforms?.[socketId] ?? asset.defaultTransform;
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

export function buildRig(config: CharacterConfiguration, materials: ZoneMaterials): CharacterRig {
  // The configuration names the deity; the deity's definition carries the
  // skeleton. Pure data lookup — the engine never branches on WHICH deity.
  const deity = getAvailableDeity(config.deity);
  if (!deity) throw new Error(`No available deity definition for "${config.deity}"`);

  // The body IS the anatomy. A mesh body's bones sit where its own joints
  // are, so it names the skeleton it was built for and the rig follows it;
  // a procedural body is generated to whatever skeleton the deity brings.
  // Pure data either way — the engine never asks which deity or which mesh.
  const bodyAsset = resolveAssetRef(config.parts.body);
  const bodySkeleton = bodyAsset?.skeleton ? getSkeleton(bodyAsset.skeleton) : undefined;
  const skeleton = bodySkeleton ?? deity.skeleton;

  const warnings: string[] = [];
  const uprightAttachments: THREE.Object3D[] = [];
  const groundedAttachments: CharacterRig["groundedAttachments"] = [];
  const held: HeldItem[] = [];
  const root = new THREE.Group();
  root.name = "statueRoot";
  const { characterRoot, joints } = buildJointHierarchy(skeleton);
  root.add(characterRoot);
  const sockets = buildSockets(skeleton, joints, root, BASE_TOP_HEIGHT[config.base.style] ?? 0);

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
        }
      : undefined,
  );

  const baseCtx: Omit<GeneratorContext, "params"> = {
    materials,
    proportions: config.proportions,
    morphs: config.morphs,
    hands: config.hands,
    arms: config.arms,
    seated:
      config.pose.preset !== null && getPosePreset(config.pose.preset)?.seated === true,
    body: bodyProfile,
  };
  const ctxFor = (asset: AssetDefinition): GeneratorContext => ({
    ...baseCtx,
    params: asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {},
  });

  // Features baked into complete sculpts (e.g. an AI/artist head with its
  // own ears and crown) suppress the corresponding standalone parts and
  // attachments — data-driven, from asset metadata.
  const integratedFeatures = new Set<string>();
  for (const ref of Object.values(config.parts)) {
    const asset = resolveAssetRef(ref);
    for (const feature of asset?.integratedFeatures ?? []) integratedFeatures.add(feature);
  }

  // Parts. Socket-mounted part entries (ear jewellery etc.) are deferred
  // until every joint entry has landed, so owner parts have already
  // refined the sockets they terminate on.
  const socketMounts: Array<{ assetId: string; socket: SocketId; object: THREE.Object3D }> = [];
  for (const [slot, ref] of Object.entries(config.parts)) {
    const asset = resolveAssetRef(ref);
    if (ref && !asset) {
      warnings.push(`Unknown part asset: ${ref.assetId}`);
      continue;
    }
    if (!asset) continue;
    if (integratedFeatures.has(slot) && !asset.integratedFeatures?.includes(slot)) continue;
    const renderable = resolveRenderable(asset, ctxFor(asset), warnings);
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
      // trunk's tip) — move those sockets onto the generated geometry.
      for (const refinement of entry.socketRefinements ?? []) {
        sockets.get(refinement.id)?.position.set(...refinement.position);
      }
    }
  }

  for (const mount of socketMounts) {
    const socket = sockets.get(mount.socket);
    if (!socket) {
      warnings.push(`Asset ${mount.assetId}: unknown socket ${mount.socket}`);
      continue;
    }
    socket.add(mount.object);
  }

  // Attachments — skip hand sockets on arms that are not rendered.
  const activeSlots = activeArmSlots(config.arms);
  const inactiveHandSockets = new Set(
    (["frontLeft", "frontRight", "backLeft", "backRight"] as const)
      .filter((slot) => !activeSlots.includes(slot))
      .flatMap((slot) => [`arm.${slot}.hand.item`, `arm.${slot}.wrist`]),
  );

  for (const attachment of config.attachments) {
    if (inactiveHandSockets.has(attachment.socket)) continue;
    const socketSuffix = attachment.socket.split(".").pop() ?? attachment.socket;
    if (integratedFeatures.has(attachment.socket) || integratedFeatures.has(socketSuffix)) continue;
    const asset = resolveAssetRef(attachment.asset);
    if (!asset) {
      warnings.push(`Unknown attachment asset: ${attachment.asset.assetId}`);
      continue;
    }
    const socket = sockets.get(attachment.socket as SocketId);
    if (!socket) {
      warnings.push(`Attachment ${asset.id}: unknown socket ${attachment.socket}`);
      continue;
    }
    // A planted staff needs to know how high above the base it is being
    // held, so it can be built long enough to stand on the ground. The
    // character root has not been lifted onto the base yet, so the
    // socket's height IS its clearance above it.
    const presentation = asset.presentation ?? {};
    let reach: number | undefined;
    if (presentation.grounded) {
      socket.updateWorldMatrix(true, false);
      reach = socket.getWorldPosition(new THREE.Vector3()).y;
    }
    const renderable = resolveRenderable(asset, { ...ctxFor(asset), reach }, warnings);
    if (!renderable || !(renderable instanceof THREE.Object3D)) continue;
    renderable.name = `attachment:${asset.id}`;
    applyAttachmentTransforms(renderable, asset, attachment.socket, attachment.offset);
    socket.add(renderable);
    if (asset.keepUpright || presentation.upright) uprightAttachments.push(renderable);
    // A hand socket holding something that stands upright in the world
    // tells the arm which way the fist has to face — but only a hand that
    // is MODELLED needs turning. A procedural hand is generated in the
    // mudra it was asked for, fingers already closed the right way round
    // the item, so its wrist belongs to the pose. A mesh hand says which
    // it is by declaring a grip morph for that arm.
    const heldBy = attachment.socket.match(/^arm\.([A-Za-z]+)\.hand\.item$/)?.[1];
    const modelledHand =
      heldBy !== undefined &&
      (bodyAsset?.morphTargets ?? []).includes(
        `grip${heldBy[0]!.toUpperCase()}${heldBy.slice(1)}`,
      );
    if (heldBy && modelledHand && (asset.keepUpright || presentation.upright)) {
      held.push({
        slot: heldBy as HeldItem["slot"],
        // Upright items present their own axis vertically, whatever the
        // asset's local axis is; the engine has already turned them.
        axis: [0, 1, 0],
        // Where this body's thumb actually is, if it measured itself.
        thumb: bodyAsset?.thumbAxes?.[heldBy] as HeldItem["thumb"],
      });
    }
    if (reach !== undefined) {
      groundedAttachments.push({
        object: renderable,
        reach,
        baseTop: BASE_TOP_HEIGHT[config.base.style] ?? 0,
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
  characterRoot.position.y = BASE_TOP_HEIGHT[config.base.style] ?? 0;

  // Whole-statue height proportion (uniform so nothing distorts).
  root.scale.setScalar(config.proportions.height);

  // Morph weights for assets that expose morph targets (GLB/skinned).
  // Procedural generators consumed the same weights parametrically above.
  applyMorphInfluences(root, config.morphs);

  return {
    root,
    skeleton,
    joints,
    sockets,
    uprightAttachments,
    groundedAttachments,
    held,
    body: bodyProfile,
    warnings,
  };
}

const worldQuaternion = new THREE.Quaternion();
const groundedPoint = new THREE.Vector3();

/**
 * Re-orient upright attachments after a pose change: the object's world
 * rotation becomes identity (shaft vertical, as classical iconography
 * depicts held attributes), whatever its parent joint chain does.
 */
export function alignUprightAttachments(rig: CharacterRig): void {
  for (const object of rig.uprightAttachments) {
    const parent = object.parent;
    if (!parent) continue;
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(worldQuaternion);
    object.quaternion.copy(worldQuaternion.invert());
  }
  // Re-plant the staffs. Their butt belongs on the base whatever the pose
  // did to the hand, so the offset is computed in the statue's own frame
  // and then expressed in the socket's — which by now may be rotated any
  // which way by the arm carrying it.
  for (const { object, reach, baseTop } of rig.groundedAttachments) {
    const parent = object.parent;
    if (!parent) continue;
    parent.updateWorldMatrix(true, false);
    const socket = rig.root.worldToLocal(parent.getWorldPosition(groundedPoint));
    parent.getWorldQuaternion(worldQuaternion);
    object.position
      .set(0, baseTop + reach - socket.y, 0)
      .applyQuaternion(worldQuaternion.invert());
  }
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

/** Verify every socket of the rig's skeleton exists on the built rig. */
export function assertRigIntegrity(rig: CharacterRig): void {
  for (const socket of rig.skeleton.sockets) {
    if (!rig.sockets.has(socket.id)) {
      throw new Error(`Rig integrity: missing socket ${socket.id} (${socket.label})`);
    }
  }
}
