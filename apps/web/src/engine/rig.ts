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
  SKELETON,
  SOCKETS,
  activeArmSlots,
  getSocket,
  type CharacterConfiguration,
  type JointId,
  type SocketId,
} from "@devaform/character-schema";
import { resolveAssetRef, type AssetDefinition } from "@devaform/asset-system";
import {
  ATTACHMENT_GENERATORS,
  BASE_BUILDERS,
  BASE_TOP_HEIGHT,
  PART_GENERATORS,
  type GeneratorContext,
} from "./generators";
import { getGlb, instantiateGlb } from "./glbCache";
import type { ZoneMaterials } from "./materials";

export interface CharacterRig {
  root: THREE.Group;
  joints: ReadonlyMap<JointId, THREE.Object3D>;
  sockets: ReadonlyMap<SocketId, THREE.Object3D>;
  /** Assets that failed to resolve or are still loading (not fatal). */
  warnings: string[];
}

function buildJointHierarchy(): { characterRoot: THREE.Group; joints: Map<JointId, THREE.Object3D> } {
  const joints = new Map<JointId, THREE.Object3D>();
  const characterRoot = new THREE.Group();
  characterRoot.name = "characterRoot";

  for (const def of SKELETON) {
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

function buildSockets(joints: Map<JointId, THREE.Object3D>): Map<SocketId, THREE.Object3D> {
  const sockets = new Map<SocketId, THREE.Object3D>();
  for (const def of SOCKETS) {
    const joint = joints.get(def.joint);
    if (!joint) throw new Error(`Socket ${def.id} references unknown joint ${def.joint}`);
    const socket = new THREE.Object3D();
    socket.name = `socket:${def.id}`;
    socket.position.set(...def.position);
    socket.rotation.set(...def.rotation);
    joint.add(socket);
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

function applyAttachmentTransforms(
  object: THREE.Object3D,
  asset: AssetDefinition,
  offset:
    | {
        position?: readonly [number, number, number];
        rotation?: readonly [number, number, number];
        scale?: number;
      }
    | undefined,
): void {
  const dt = asset.defaultTransform;
  if (dt?.position) object.position.set(...dt.position);
  if (dt?.rotation) object.rotation.set(...dt.rotation);
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
  const warnings: string[] = [];
  const root = new THREE.Group();
  root.name = "statueRoot";
  const { characterRoot, joints } = buildJointHierarchy();
  root.add(characterRoot);
  const sockets = buildSockets(joints);

  const baseCtx: Omit<GeneratorContext, "params"> = {
    materials,
    proportions: config.proportions,
    morphs: config.morphs,
    hands: config.hands,
    arms: config.arms,
  };
  const ctxFor = (asset: AssetDefinition): GeneratorContext => ({
    ...baseCtx,
    params: asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {},
  });

  // Parts
  for (const ref of Object.values(config.parts)) {
    const asset = resolveAssetRef(ref);
    if (ref && !asset) {
      warnings.push(`Unknown part asset: ${ref.assetId}`);
      continue;
    }
    if (!asset) continue;
    const renderable = resolveRenderable(asset, ctxFor(asset), warnings);
    if (!renderable) continue;
    if (renderable instanceof THREE.Object3D) {
      // GLB part: meshes are placed under the joints their names declare
      // (JOINT_<id> grouping); otherwise parent to the character root.
      characterRoot.add(renderable);
      continue;
    }
    for (const { joint, object } of renderable.jointed) {
      const target = joints.get(joint);
      if (!target) {
        warnings.push(`Asset ${asset.id}: unknown joint ${joint}`);
        continue;
      }
      object.name = object.name || `part:${asset.id}`;
      target.add(object);
    }
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
    const renderable = resolveRenderable(asset, ctxFor(asset), warnings);
    if (!renderable || !(renderable instanceof THREE.Object3D)) continue;
    renderable.name = `attachment:${asset.id}`;
    applyAttachmentTransforms(renderable, asset, attachment.offset);
    socket.add(renderable);
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

  return { root, joints, sockets, warnings };
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

/** Verify every socket in the schema exists on the built rig (dev sanity). */
export function assertRigIntegrity(rig: CharacterRig): void {
  for (const socket of SOCKETS) {
    if (!rig.sockets.has(socket.id)) {
      throw new Error(`Rig integrity: missing socket ${socket.id} (${getSocket(socket.id).label})`);
    }
  }
}
