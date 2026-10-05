/**
 * EXPERIMENT — an explicit attachment graph, isolated from production.
 *
 * Nothing in the shipped engine imports this. It exists to answer one
 * question with measurements instead of opinion: would an explicit graph
 * of attachment nodes, each with a local frame and a declared parent,
 * make DevaForm's placement more robust than the scene graph it already
 * builds? See `docs/attachment-graph-experiment.md` for the proposal,
 * the evidence that prompted it, and the decision rule fixed in advance.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No new placement mathematics, no
 * clearance resolution, no orientation policy, no semantic region. Those
 * are `walkSurface`, `GripFrame`, `aimSocket` and `WornFit` respectively,
 * and a model that restated them would be measuring its own reflection —
 * which is the failure mode the spatial-occupancy experiment was held to
 * and this one is held to as well.
 *
 * The one capability it adds over the production path is the third
 * anchor kind: a node whose parent is ANOTHER NODE. Production can hang
 * an attachment on a joint or on a socket, and nothing else; the tree is
 * exactly one attachment deep.
 */
import * as THREE from "three";
import type { CharacterRig } from "../rig";

/** What a node hangs from. */
export type AttachmentAnchor =
  /** A skeleton joint, by id. Production can do this. */
  | { kind: "joint"; id: string }
  /** A declared socket, by id. Production can do this. */
  | { kind: "socket"; id: string }
  /** ANOTHER NODE in this graph. Production cannot do this. */
  | { kind: "node"; id: string };

/**
 * Where a node sits in its anchor's frame.
 *
 * Position and rotation only. A frame that also carried clearance or a
 * surface reference would be duplicating fields `WornFit` and the body
 * profile already own — see the proposal's section 4 for why those were
 * left out rather than copied from the sketch.
 */
export interface LocalFrame {
  position: readonly [number, number, number];
  /** Euler XYZ, radians. */
  rotation?: readonly [number, number, number];
  scale?: number;
}

export interface AttachmentNode {
  id: string;
  parent: AttachmentAnchor;
  frame: LocalFrame;
  /**
   * Whether the node follows its parent when the figure is posed.
   *
   * Always true for anything built on the scene graph, which is the
   * point: production gets this for free and cannot switch it off. A
   * model that offers the switch has to justify the case for turning it
   * off, and the experiment found none.
   */
  inheritPose?: boolean;
  /** Whether a parent's scale reaches the child. */
  inheritScale?: boolean;
  /** The thing to place. Any Object3D; the graph does not build geometry. */
  object: THREE.Object3D;
}

export interface GraphResult {
  /** Node id -> the object, now parented. */
  placed: Map<string, THREE.Object3D>;
  /** Nodes that could not be resolved, and why. */
  unresolved: string[];
  /** Longest chain from a joint or socket down to a leaf. */
  depth: number;
}

/**
 * Hang every node off whatever it says it hangs off.
 *
 * Nodes may be given in any order; a node whose parent is another node is
 * deferred until that one is placed. A cycle, or an anchor that does not
 * exist, leaves the node unplaced and named in `unresolved` rather than
 * throwing: a graph that refuses to build at all would be worse than the
 * production path, which warns and carries on.
 */
export function resolveAttachmentGraph(
  rig: CharacterRig,
  nodes: readonly AttachmentNode[],
): GraphResult {
  const placed = new Map<string, THREE.Object3D>();
  const depthOf = new Map<string, number>();
  const remaining = [...nodes];
  const unresolved: string[] = [];

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const node = remaining[i]!;
      const anchor = anchorObject(rig, node.parent, placed);
      if (!anchor) continue;
      apply(node);
      anchor.add(node.object);
      placed.set(node.id, node.object);
      depthOf.set(
        node.id,
        node.parent.kind === "node" ? (depthOf.get(node.parent.id) ?? 0) + 1 : 1,
      );
      remaining.splice(i, 1);
      progress = true;
    }
  }
  for (const node of remaining) {
    unresolved.push(`${node.id}: nothing named ${node.parent.kind} "${node.parent.id}"`);
  }
  return {
    placed,
    unresolved,
    depth: depthOf.size === 0 ? 0 : Math.max(...depthOf.values()),
  };
}

function anchorObject(
  rig: CharacterRig,
  anchor: AttachmentAnchor,
  placed: ReadonlyMap<string, THREE.Object3D>,
): THREE.Object3D | null {
  if (anchor.kind === "joint") return rig.joints.get(anchor.id as never) ?? null;
  if (anchor.kind === "socket") return rig.sockets.get(anchor.id as never) ?? null;
  return placed.get(anchor.id) ?? null;
}

function apply(node: AttachmentNode): void {
  node.object.position.set(...node.frame.position);
  if (node.frame.rotation) node.object.rotation.set(...node.frame.rotation);
  if (node.frame.scale !== undefined) node.object.scale.setScalar(node.frame.scale);
  /**
   * `inheritPose: false` is the only thing here the scene graph cannot
   * express, and the honest way to model it is "this node is not in the
   * tree" rather than a flag the renderer has to honour every frame.
   * Recorded as a no-op so the experiment can say it was considered: no
   * DevaForm asset wants it, and the one class that might — a planted
   * item standing on the ground while the figure moves — is already
   * handled by parenting to the statue root instead.
   */
  if (node.inheritScale === false) node.object.scale.setScalar(1);
}

/**
 * Read the rig's EXISTING attachments back as a graph.
 *
 * The comparison the experiment needs: if describing what production
 * already builds produces a graph of uniform depth one, then the model's
 * extra expressiveness is unused by every asset that ships.
 */
export function describeRigAsGraph(rig: CharacterRig): {
  nodes: number;
  bySocket: number;
  byJoint: number;
  deeperThanOne: string[];
} {
  const socketSet = new Set<THREE.Object3D>(rig.sockets.values());
  const jointSet = new Set<THREE.Object3D>(rig.joints.values());
  let nodes = 0;
  let bySocket = 0;
  let byJoint = 0;
  const deeperThanOne: string[] = [];
  rig.root.traverse((object) => {
    if (!/^(part|attachment):/.test(object.name)) return;
    nodes += 1;
    const parent = object.parent;
    if (!parent) return;
    if (socketSet.has(parent)) bySocket += 1;
    else if (jointSet.has(parent)) byJoint += 1;
    else {
      // Parented to neither a socket nor a joint: walk up and see whether
      // another named asset is above it.
      let above: THREE.Object3D | null = parent;
      while (above && !/^(part|attachment):/.test(above.name)) above = above.parent;
      if (above) deeperThanOne.push(`${object.name} under ${above.name}`);
    }
  });
  return { nodes, bySocket, byJoint, deeperThanOne };
}
