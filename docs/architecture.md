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

## Morphs: parametric today, blend shapes later

Morph weights live in `configuration.morphs` (name → [-1, 1]). With the
procedural prototype assets the engine applies them *parametrically*: the
generators read the weights and regenerate geometry (a structure rebuild,
same path as swapping a part). Production GLB assets will map the same
morph names onto real blend shapes applied in place. The configuration is
identical either way, so saves are stable across that transition. Canonical
morph names live in `character-schema/src/morphs.ts`.

## Hands, mudras & the item grip system

Hands are a part slot (`hands`) whose generator builds palm + four fingers +
thumb per rendered arm. Finger curl is per-phalanx, so mudras (abhaya,
varada, open, hold/cradle, pinch/stem-hold, grip/fist) are actual geometry
driven by `configuration.hands[armSlot].mudra`. `configuration.arms.count`
(2 | 4) controls which arm chains render; attachments on hidden back-hand
sockets are retained in the document and simply not mounted.

Hand-held items compose three pieces of asset metadata:

- `grip: { mudra }` — attaching the item to a hand socket auto-applies the
  matching mudra in the store, so defaults always look held.
- `defaultTransform` / `socketTransforms` — per-socket placement (the grip
  point of a fist differs from the trunk tip; keys are socket ids).
- `keepUpright` — after every pose application the engine zeroes the item's
  world rotation (`alignUprightAttachments`), keeping shafted attributes
  (axe, noose, goad, lotus) vertical in any pose, as classical iconography
  depicts them. Cradled items (modak) follow the palm instead.

## Deity definitions

`packages/asset-system/src/deities.ts` declares every deity as data:
identity, availability, asset manifest, editor categories, pose presets,
arm options and a default-configuration factory. The `/studio/[deity]`
route resolves a definition and provides it via `DeityProvider`; editor
components read `useDeity()` and never import a deity directly. The asset
registry aggregates the manifests of available deities. Upcoming deities
(Shiva, Durga, Krishna, Hanuman, Lakshmi, Saraswati) are declared
`available: false` and render an honest "coming soon" page.

## Preview, share & export

- **Thumbnails**: saving captures a small JPEG from the viewport
  (`engine/capture.ts`) stored on the Character row — the library shows
  real creation previews.
- **Share**: a `Share` row pins one immutable `CharacterVersion`;
  `/share/[id]` rebuilds the creation in a standalone read-only viewer
  (`engine/StaticCharacterView`) with no editor-state coupling, and can
  open a copy in Divine Studio. Shares expose only the shared creation.
- **Export** (`engine/printExport.ts` + ExportDialog): PNG render, JSON
  configuration, posed binary STL, and a printability report that only
  claims what it actually checks (see docs/printing.md).
- **Commerce model** (`character-schema/src/commerce.ts`): sizes,
  materials, variants, cart/order shapes built around `CreationSnapshot`
  (configuration + pinned asset versions) for manufacturing
  reproducibility. Checkout/payment integration is intentionally absent
  until credentials exist.

## Naming: DevaForm → Divine Studio → deity

"Divine Studio" is the generic editor experience; the deity is data
(`configuration.deity`), never part of the studio's identity. UI copy,
titles and docs follow `DevaForm | Divine Studio`, with the current deity
shown as a chip/label.

## GLB pipeline

`engine/glbCache.ts` loads GLB files once via GLTFLoader and hands out
clones. Materials named `zone:<zone>` (per the Asset Specification) are
remapped to the live user-controlled zone materials; authored materials pass
through. Loading is async against a sync rig build: missing assets are
skipped and a cache subscription rebuilds the rig when they arrive. Cloned
GLB geometry is shared with the cache (flagged `userData.glbShared`) and
excluded from rig disposal. `apps/web/scripts/generate-prototype-glbs.mjs`
generates the prototype Mushak GLB through three's GLTFExporter — the app
consumes it exactly like an artist-delivered file.

## Thumbnails

`engine/thumbnails.ts` renders each asset's real geometry (procedural
assembled on a rest-pose skeleton, or the loaded GLB) with the default
palette into a shared offscreen WebGL canvas, cached as data URLs.

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

## Identity, ownership & security

First-party auth (`apps/web/src/lib/auth.ts`): scrypt-hashed passwords
(node:crypto — no external identity provider required) and httpOnly
cookie sessions. Every visitor gets an anonymous `Session`; creations
are owned by that session until sign-up/sign-in **claims** them onto the
`User`. Ownership checks (`ownsCharacter`/`ownershipWhere`) gate every
character mutation and the library listing; unknown and foreign ids both
return a uniform 404 so ids cannot be probed. Share creation requires
ownership; share *reading* stays public by design (that is the sharing
feature) and exposes only the shared creation. Logout rotates to a fresh
anonymous session. Legacy pre-auth rows (null owner) remain visible in
local development only.

Other posture:
- No secrets in the frontend; DB URL via env only. No secrets exist yet.
- All write endpoints validate payloads (zod + registry checks); login
  errors are uniform (no email-existence oracle).
- No file paths or executable content accepted from clients.
- Remaining before public deployment: rate limiting on auth endpoints,
  password reset (needs email service), CSRF hardening if cookies move
  beyond same-site usage.

## Roadmap pointers

Phases as agreed: A foundation (this) → B production Ganesha assets → C
advanced customization (morphs, mudras, IK) → D print pipeline → E commerce →
F platform/accounts → G more deities. The deity-agnostic core (schema slots,
skeleton, sockets, registry, categories-as-data) is what keeps G from
requiring an engine rewrite.
