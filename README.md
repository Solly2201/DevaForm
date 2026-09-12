# DevaForm

**A premium customizable Indian deity statue creation platform.**

Customers design their own deity statue — beginning with Lord Ganesha — in a
browser-based realtime 3D editor: pose, ornaments, held attributes, clothing,
colors and materials. The finished configuration is manufactured as a premium
3D-printed statue.

## Repository layout

```
apps/
  web/                    Next.js editor application (UI + 3D engine + API)
packages/
  character-schema/       Versioned CharacterConfiguration, skeleton, sockets, poses
  asset-system/           Asset metadata types, registry, deity manifests, categories
docs/
  architecture.md         System architecture and design decisions
  asset-specification.md  The Asset Bible — production rules for 3D artists
  ai-asset-workflow.md    AI-assisted Ganesha asset production pipeline
tools/
  blender/                Blender automation for asset validation/export
```

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
  pupil, lids, liner, brows), twin-domed elephant head, fan ears, curve-based
  trunk with left/right/straight variants, Ekadanta/double/short tusks, real
  hands with fingers + thumb and four mudras per hand (abhaya/varada/open/hold)
- Two-arm / four-arm (Chaturbhuja) switching; hidden back-hand items persist
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
- Save / load / delete characters (SQLite via Prisma, immutable version rows)
- Undo/redo (zundo temporal store, Ctrl+Z / Ctrl+Y / Ctrl+S)

All Ganesha geometry is procedural at stage `prototype` — deliberately
statue-styled but not sculpted art. The engine, schema, sockets, registry and
GLB pipeline are the production architecture; artist-made GLB assets slot in
by changing manifest entries only.

See [docs/architecture.md](docs/architecture.md) for the full picture and
roadmap.
