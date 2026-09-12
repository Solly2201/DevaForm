# DevaForm Architecture

## Core principle

Everything revolves around one deterministic, serializable document:

```
                CharacterConfiguration
                        |
         +--------------+--------------+
         |              |              |
         v              v              v
        UI          3D ENGINE       BACKEND
   (writes it)     (renders it)   (persists it)
                        |
                        v
              (future) BAKE / EXPORT -> STL / 3MF -> manufacturing
```

Given a configuration plus the referenced asset versions, the same character
can always be reconstructed — the property a manufacturing business needs for
reproducible orders.

## Monorepo

pnpm workspace, no Turborepo yet (three projects; plain `pnpm -r` is
sufficient — revisit when build graphs get expensive).

| Package | Responsibility |
|---|---|
| `@devaform/character-schema` | `CharacterConfiguration` (zod, versioned, migrations), canonical skeleton + joint limits, socket definitions, pose presets, defaults |
| `@devaform/asset-system` | Asset metadata types, asset registry, deity manifests, editor category definitions |
| `@devaform/web` | Next.js app: editor UI, R3F 3D engine, Zustand state, API routes, Prisma persistence |

Packages are consumed as TypeScript source via Next `transpilePackages` — no
per-package build step. If a non-Next consumer appears (e.g. a worker
service), add a `tsc` build to the packages then.

## Character schema (`character-schema`)

- `schemaVersion` literal + migration table in `serialization.ts`. Old saves
  migrate forward on load and are then strictly validated.
- `parts`: part-slot → `AssetRef { assetId, version }` — whole-mesh component
  swaps (head, ears, trunk, tusks, body, garments…).
- `attachments`: socket → `AssetRef` (+ optional user offset transform) —
  crowns, ornaments, hand items.
- `pose`: named preset + per-joint euler overrides. Presets are data
  (`poses.ts`); overrides layer on top; unknown joints are ignored, missing
  joints rest — forward/backward compatible as the skeleton grows.
- `morphs`: name → weight record. The engine applies any morph the active
  meshes expose and ignores the rest, so sculpted morph targets can ship
  per-asset without schema changes.
- `materials`: 7 named material *zones* (skin, garment, metal, gem…), each a
  color + finish. Zones, not per-mesh colors, so production materials can map
  zones onto PBR variants.
- `proportions`, `base`: whole-statue scaling and platform style.

## Skeleton & pose engine

`SKELETON` in `character-schema` is the canonical joint list: 25+ joints —
root/pelvis/spine/chest/neck/head, a 3-segment trunk chain, four full arm
chains (upper/forearm/hand) and two legs, each with per-axis rotation limits.

The web engine (`apps/web/src/engine/rig.ts`) instantiates this as a real
`THREE.Object3D` hierarchy (one transform per joint). Part meshes are parented
onto joints (a body distributes limb capsules across arm/leg joints), so
rotating `arm.frontRight.forearm` articulates exactly as a rigged character
does. Production GLB rigs must name their bones after these joint ids — the
pose engine then drives either representation identically.

Pose application (`pose.ts`) is an in-place transform write with clamping.
It never rebuilds geometry.

Planned extensions (fingers, facial bones, IK) are additive: new joint ids,
same machinery.

## Attachment sockets

`SOCKETS` defines named attachment points (e.g. `head.crown`,
`arm.backRight.hand.item`, `trunk.tip`) parented to joints with a local
offset. The rig creates an empty `Object3D` per socket; attachments are added
as children, so they follow every parent joint rotation for free. Assets
declare which sockets they accept plus a default transform; users can add an
offset on top (schema supports it today, transform gizmo UI later).

## Asset system

`AssetDefinition` = id, version, kind (part slot | attachment sockets), deity
compatibility, lifecycle stage (`source | prototype | production |
deprecated`), a *source* (`glb` path or `procedural` generator id), material
zones, morph target names, exclusion rules, printability metadata.

The registry is currently backed by in-repo manifests; the lookup interface
(`getAsset` / `listAssets` / `resolveAssetRef`) is what the DB-backed asset
service will implement later. The UI renders asset grids purely from registry
queries — nothing is hardcoded per asset.

Placeholders are procedural generators (`engine/generators.ts`) keyed by id —
the manifest stays pure data. Swapping in a production asset = change its
`source` to a GLB path and bump `version`.

## State & undo/redo

Two Zustand stores:

- `editorStore` — the document (`config`) + character identity. Wrapped with
  zundo `temporal`, partialized to `config` only → every document mutation is
  undoable, capped history, Ctrl+Z/Ctrl+Y.
- `uiStore` — active category, lighting preset, camera commands, dialogs,
  selected joint. Never in history, never persisted.

Rendering performance split in `CharacterRoot`:

| Change | Effect |
|---|---|
| parts / attachments / base / proportions | rig rebuild (memo), previous rig geometry disposed |
| pose | in-place joint rotation writes |
| materials | in-place mutation of shared zone `MeshStandardMaterial`s |

## Persistence

Prisma. `Character` (identity) + `CharacterVersion` (immutable config
snapshot + asset-version map per save). Orders will pin a `CharacterVersion`,
keeping manufactured statues reproducible forever.

Local dev uses SQLite (`file:./dev.db`, zero setup — decision: no Postgres
server available on dev machines yet). The schema avoids SQLite-isms;
production switches the datasource to PostgreSQL with a migration. Commerce
tables (User, Product, Order, Material, PrintSpecification) are deliberately
deferred to Phase E.

API routes validate every save server-side: strict zod schema validation plus
asset-id existence checks — client-provided ids are never trusted.

## Print pipeline (designed, not built)

The editor model is *not* the print model. The eventual pipeline:

```
CharacterConfiguration
  -> resolve print-resolution assets (same registry, print source)
  -> apply transforms + morphs -> bake skeleton pose
  -> boolean/merge -> repair/watertight -> validation
     (thin walls, floating geometry, balance)
  -> STL / 3MF
```

This runs in Python/Blender workers (see `tools/blender/`), consuming the
same configuration JSON — which is why determinism and versioning live in the
schema package, not the web app.

## Security posture (current phase)

- No secrets in the frontend; DB URL via env only.
- All write endpoints validate payloads (zod + registry checks).
- No file paths or executable content accepted from clients.
- Auth/accounts arrive in Phase F; save endpoints are currently open because
  the app runs locally. Gate them before any public deployment.

## Roadmap pointers

Phases as agreed: A foundation (this) → B production Ganesha assets → C
advanced customization (morphs, mudras, IK) → D print pipeline → E commerce →
F platform/accounts → G more deities. The deity-agnostic core (schema slots,
skeleton, sockets, registry, categories-as-data) is what keeps G from
requiring an engine rewrite.
