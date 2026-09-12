# DevaForm

**A premium customizable Indian deity statue creation platform.**

Customers design their own deity statue in **Divine Studio** — DevaForm's
browser-based realtime 3D editor: pose, ornaments, held attributes, clothing,
colors and materials. The finished configuration is manufactured as a premium
3D-printed statue. Divine Studio is deity-generic; **Ganesha** is the first
deity implemented (`deity = ganesha`), with Shiva, Durga, Krishna and others
to follow on the same engine.

## Repository layout

```
apps/
  web/                    Next.js application (site + Divine Studio + 3D engine + API)
packages/
  character-schema/       Versioned CharacterConfiguration, skeleton, sockets, poses, commerce model
  asset-system/           Deity definitions, asset registry, deity manifests, categories
docs/
  architecture.md         System architecture and design decisions
  deity-system.md         How to add a deity
  printing.md             Export & print pipeline status
  asset-specification.md  The Asset Bible — production rules for 3D artists
  ai-asset-workflow.md    AI-assisted asset production pipeline
tools/
  blender/                Blender automation for asset validation/export
```

## Routes

| Route | Purpose |
|---|---|
| `/` | DevaForm landing |
| `/deities` | Deity selection (Ganesha available; six deities coming soon) |
| `/studio/[deity]` | Divine Studio for an available deity |
| `/library` | Saved creations: open, rename, duplicate, delete |
| `/share/[id]` | Public share view, rebuilt from the pinned configuration |
| `/dev/assets` | Internal asset-registry view |

## Getting started

Requirements: Node ≥ 20, pnpm ≥ 9.

```bash
pnpm install
pnpm db:push        # create the local SQLite dev database
pnpm dev            # http://localhost:3000
```

Other commands:

```bash
pnpm typecheck      # strict TS across all packages
pnpm lint
pnpm build          # production build
```

## What works today

- Full editor shell: category sidebar, 3D viewport, customization panel, top bar
- Real THREE.js joint hierarchy (25 joints incl. four arms and a 3-segment trunk)
- A recognizable procedural Ganesha: sculpted eye assemblies (sclera, iris,
  pupil, hooded lids, liner, brows, socket rims), three genuinely distinct
  heads (Classic / Bal / Regal), four ear styles incl. gold-trimmed, six
  trunk variants (left/right/straight/upward/long/short), four tusk variants
  (Ekadanta / double / short / curved), real hands with six mudras
  (abhaya, varada, open, cradle, stem-hold, weapon-grip)
- A real hand–item grip system: five attributes (modak, lotus, parashu,
  pasha, ankush) with per-item grip metadata — attaching one auto-applies
  the right mudra, per-socket transforms place it in the palm, and shafted
  attributes stay world-upright through every pose
- Two-arm / four-arm (Chaturbhuja) switching; hidden back-hand items persist
- Seated poses swap the dhoti to pose-compatible lap drapery and lower the
  figure onto its base; companion (Mushak GLB) placement left/front/right
- Face shaping: parametric morphs (eye size/spacing/height, brow height,
  ear size/angle, trunk length/curl) as real sliders
- Pose presets (standing / blessing / meditation / royal ease / dancing) with
  seated poses lowering onto the base, plus per-joint sliders with limits
- Attachment sockets — crowns, necklaces, waist bands, hand items and the
  trunk-tip modak follow their parent joints through any pose
- Jewellery sets as parts (earrings, armlets, bracelets, anklets) that
  articulate with limbs
- Real GLB pipeline: GLTFLoader + cache + `zone:*` material remapping,
  proven by the Mushak companion asset (`apps/web/scripts/
  generate-prototype-glbs.mjs` regenerates it)
- PBR materials (MeshPhysicalMaterial + procedural RoomEnvironment IBL),
  8 curated palettes (Traditional, Temple Gold, Ivory, Terracotta, Saffron,
  Royal Blue, Marble, Black Stone) + per-zone fine-tuning
- Real 3D asset thumbnails rendered from actual geometry
- Save / load / rename / duplicate / delete creations (SQLite via Prisma,
  immutable version rows) with real viewport thumbnails and autosave
- Public sharing: a share pins one immutable creation version and is
  rebuilt live in 3D at `/share/[id]`
- Studio render (PNG), configuration (JSON) and posed STL exports, with an
  honest printability report (dimensions, triangles, base contact;
  watertight/thin-wall marked as pending the manufacturing pipeline)
- Deity definition system: the studio consumes `DeityDefinition` data —
  Ganesha is the first entry, six more deities are declared as coming soon
- Undo/redo (zundo temporal store, Ctrl+Z / Ctrl+Y / Ctrl+S)
- `pnpm validate-assets`: GLB container/bounds/material validation plus
  manifest cross-checks

All Ganesha geometry is procedural at stage `prototype` — deliberately
statue-styled but not sculpted art. The engine, schema, sockets, registry and
GLB pipeline are the production architecture; artist-made GLB assets slot in
by changing manifest entries only.

See [docs/architecture.md](docs/architecture.md) for the full picture and
roadmap.
