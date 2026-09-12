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
- Pose presets (standing / blessing / meditation / royal / dance) + per-joint
  rotation sliders with anatomical limits
- Attachment socket system — crowns, necklaces and hand-held attributes follow
  their parent joints through any pose
- Component swapping from the asset registry (heads, ears, trunks, tusks,
  bodies, garments…)
- Material zones: color + finish (matte/satin/polished/metallic) per zone
- Save / load / delete characters (SQLite via Prisma, immutable version rows)
- Undo/redo (zundo temporal store, Ctrl+Z / Ctrl+Y / Ctrl+S)

All 3D assets are procedural placeholders (stage: `prototype`). The engine,
schema, sockets and registry are the real product architecture; production
GLB assets slot in by changing manifest entries only.

See [docs/architecture.md](docs/architecture.md) for the full picture and
roadmap.
