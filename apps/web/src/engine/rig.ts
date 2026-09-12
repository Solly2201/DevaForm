/**
 * Rig builder.
 *
 * Builds the character's joint hierarchy (real THREE.Object3D transforms —
 * the same articulation model a GLB skeleton maps onto), populates part
 * meshes onto joints, creates sockets and mounts attachments.
 *
 * The rig is rebuilt when structure changes (parts/attachments); pose and
 * materials are applied in place without rebuilding (see pose.ts /
 * materials.ts).
 */
import * as THREE from "three";
import {
  SKELETON,
  SOCKETS,
  getSocket,
  type CharacterConfiguration,
  type JointId,
  type SocketId,
} from "@devaform/character-schema";
import { resolveAssetRef, type AssetDefinition } from "@devaform/asset-system";
import { ATTACHMENT_GENERATORS, PART_GENERATORS, type GeneratorContext } from "./generators";
import type { ZoneMaterials } from "./materials";

export interface CharacterRig {
  root: THREE.Group;
  joints: ReadonlyMap<JointId, THREE.Object3D>;
  sockets: ReadonlyMap<SocketId, THREE.Object3D>;
  /** Assets that failed to resolve or build (surfaced to the UI, not fatal). */
  warnings: string[];
}

function buildJointHierarchy(): { root: THREE.Group; joints: Map<JointId, THREE.Object3D> } {
  const joints = new Map<JointId, THREE.Object3D>();
  const root = new THREE.Group();
  root.name = "characterRoot";

  for (const def of SKELETON) {
    const joint = new THREE.Object3D();
    joint.name = `joint:${def.id}`;
    joint.position.set(...def.position);
    joints.set(def.id, joint);
    if (def.parent === null) {
      root.add(joint);
    } else {
      const parent = joints.get(def.parent);
      if (!parent) throw new Error(`Skeleton parent ${def.parent} not built before ${def.id}`);
      parent.add(joint);
    }
  }
  return { root, joints };
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

function buildPart(
  asset: AssetDefinition,
  ctx: GeneratorContext,
  joints: Map<JointId, THREE.Object3D>,
  warnings: string[],
): void {
  if (asset.source.kind !== "procedural") {
    // GLB part loading lands with production assets; the rig contract
    // (joint names) is already defined so this is purely additive.
    warnings.push(`Asset ${asset.id}: GLB part loading not yet implemented`);
    return;
  }
  const generator = PART_GENERATORS[asset.source.generatorId];
  if (!generator) {
    warnings.push(`Asset ${asset.id}: unknown generator ${asset.source.generatorId}`);
    return;
  }
  for (const { joint, object } of generator(ctx)) {
    const target = joints.get(joint);
    if (!target) {
      warnings.push(`Asset ${asset.id}: unknown joint ${joint}`);
      continue;
    }
    object.name = object.name || `part:${asset.id}`;
    target.add(object);
  }
}

function buildAttachment(
  asset: AssetDefinition,
  socketId: SocketId,
  offset: { position?: readonly [number, number, number]; rotation?: readonly [number, number, number]; scale?: number } | undefined,
  ctx: GeneratorContext,
  sockets: Map<SocketId, THREE.Object3D>,
  warnings: string[],
): void {
  const socket = sockets.get(socketId);
  if (!socket) {
    warnings.push(`Attachment ${asset.id}: unknown socket ${socketId}`);
    return;
  }
  if (asset.source.kind !== "procedural") {
    warnings.push(`Asset ${asset.id}: GLB attachment loading not yet implemented`);
    return;
  }
  const generator = ATTACHMENT_GENERATORS[asset.source.generatorId];
  if (!generator) {
    warnings.push(`Asset ${asset.id}: unknown generator ${asset.source.generatorId}`);
    return;
  }
  const object = generator(ctx);
  object.name = `attachment:${asset.id}`;

  // Asset default transform, then user offset on top.
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

  socket.add(object);
}

/** Statue base platform under the character. */
function buildBase(config: CharacterConfiguration, ctx: GeneratorContext, root: THREE.Group): void {
  if (config.base.style === "none") return;
  const material = ctx.materials.get("base");
  let geometry: THREE.BufferGeometry;
  switch (config.base.style) {
    case "round":
      geometry = new THREE.CylinderGeometry(0.34, 0.38, 0.06, 36);
      break;
    case "square":
      geometry = new THREE.BoxGeometry(0.62, 0.06, 0.62);
      break;
    case "lotus": {
      const group = new THREE.Group();
      group.name = "base:lotus";
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 32), material);
      disk.position.y = -0.035;
      disk.castShadow = disk.receiveShadow = true;
      group.add(disk);
      const petals = 14;
      for (let i = 0; i < petals; i++) {
        const angle = (i / petals) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), material);
        petal.position.set(Math.cos(angle) * 0.32, -0.02, Math.sin(angle) * 0.32);
        petal.scale.set(1, 0.4, 0.55);
        petal.rotation.y = -angle;
        petal.castShadow = petal.receiveShadow = true;
        group.add(petal);
      }
      root.add(group);
      return;
    }
  }
  const base = new THREE.Mesh(geometry, material);
  base.name = `base:${config.base.style}`;
  base.position.y = -0.03;
  base.castShadow = base.receiveShadow = true;
  root.add(base);
}

export function buildRig(config: CharacterConfiguration, materials: ZoneMaterials): CharacterRig {
  const warnings: string[] = [];
  const { root, joints } = buildJointHierarchy();
  const sockets = buildSockets(joints);

  const baseCtx = { materials, proportions: config.proportions };

  for (const ref of Object.values(config.parts)) {
    const asset = resolveAssetRef(ref);
    if (ref && !asset) {
      warnings.push(`Unknown part asset: ${ref.assetId}`);
      continue;
    }
    if (!asset) continue;
    const params = asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {};
    buildPart(asset, { ...baseCtx, params }, joints, warnings);
  }

  for (const attachment of config.attachments) {
    const asset = resolveAssetRef(attachment.asset);
    if (!asset) {
      warnings.push(`Unknown attachment asset: ${attachment.asset.assetId}`);
      continue;
    }
    const params = asset.source.kind === "procedural" ? (asset.source.params ?? {}) : {};
    buildAttachment(
      asset,
      attachment.socket as SocketId,
      attachment.offset,
      { ...baseCtx, params },
      sockets,
      warnings,
    );
  }

  buildBase(config, { ...baseCtx, params: {} }, root);

  // Whole-statue height proportion (uniform so nothing distorts).
  root.scale.setScalar(config.proportions.height);

  return { root, joints, sockets, warnings };
}

/** Dispose all geometries owned by a rig. Materials are shared and survive. */
export function disposeRig(rig: CharacterRig): void {
  rig.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
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
