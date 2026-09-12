# Development Guide

## Setup

```bash
pnpm install
pnpm db:push        # create/update the local SQLite dev database
pnpm dev            # http://localhost:3000
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Run / build / serve the web app |
| `pnpm typecheck` | Strict TS across all packages |
| `pnpm lint` | ESLint (Next.js config) |
| `pnpm test` | Vitest suites in character-schema and asset-system |
| `pnpm validate-assets` | GLB + manifest + dataset sidecar validation |
| `pnpm --filter @devaform/web ingest-asset …` | Ingest a GLB/GLTF/OBJ into the asset dataset |
| `pnpm --filter @devaform/web generate-thumbnails` | Deterministic asset thumbnails (dev server running) |
| `pnpm --filter @devaform/web generate-glbs` | Regenerate prototype GLBs |
| `pnpm --filter @devaform/character-schema export-canonical` | Regenerate tools/blender/canonical-rig.json |

## Environment

`apps/web/.env` (see `.env.example`):

- `DATABASE_URL` — SQLite file URL in development. Production targets
  PostgreSQL: change the Prisma datasource provider, set a Postgres URL and
  run a migration. The schema avoids SQLite-only features.

No other secrets exist. Never commit `.env`.

## Where things live

- **Engine** (`apps/web/src/engine/`): rig assembly, generators, materials,
  GLB cache, pose, capture/export. Deity-agnostic — consumes registry data.
- **Editor UI** (`apps/web/src/components/editor/`): Divine Studio shell,
  panels, dialogs. Reads the active deity from `useDeity()`.
- **State** (`apps/web/src/state/`): `editorStore` (the document, undoable),
  `uiStore` (ephemeral UI), `deityContext`.
- **Schema** (`packages/character-schema`): configuration, skeleton,
  sockets, poses, palettes, morphs, commerce model, serialization.
- **Deities/assets** (`packages/asset-system`): deity definitions, asset
  manifests, registry, editor categories.

## Production deployment notes

- Swap SQLite → PostgreSQL (Prisma datasource + migration).
- Put GLBs/static assets behind a CDN; `public/assets` is the contract.
- Add authentication before exposing save/library/share mutation routes
  publicly — the current API is unauthenticated by design for local
  development and must not ship as-is (see architecture.md security notes).
- `pnpm build` is the production build; no further build-time secrets.
