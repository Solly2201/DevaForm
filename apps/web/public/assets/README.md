# Asset storage layout

Files are organised by **what an asset is**, not by who uses it.

```
assets/
├── foundations/     what a character is built on
│   ├── bodies/
│   ├── heads/
│   └── skeletons/
├── features/        what varies on it — faces, hair, eyes, ears, hands, …
├── clothing/
├── ornaments/       worn: crowns, necklaces, bands, tilaks
├── attributes/      held: weapons, instruments, offerings
├── companions/      stands on the base beside the figure
├── characters/      COMPOSITIONS — which of the above a deity is made of
├── environments/
└── presentation/    cameras, lighting, intros, transitions
```

Each asset occupies `<area>/<name>/<version>/` and contains:

```
model.glb            the geometry
asset.json           the machine-readable record of what it is
thumbnail.png        generated
```

`apps/web/scripts/lib/layout.mjs` computes the area from an asset's kind —
a part's slot, or the socket an attachment mounts on — and `pnpm
validate-assets` fails if a file is stored anywhere else. That is what
stops the tree and the rule drifting apart.

## Two rules

**1. The registry is the source of truth.** Asset ids, versions,
compatibility, provenance, stages, supersedes, sockets and grips live in
`packages/asset-system`. A path is storage and never identity — nothing
resolves an asset by walking this tree, and no id is derived from a
folder name.

This replaced deriving the path from the asset id by splitting it on
dots. That made the filesystem a projection of identity: rename a deity
and every file moved, and a human body shared between deities had nowhere
to live that was not somebody's private folder.

**2. A character composes; it does not own.** `characters/shiva`
describes which body, head, garment and attributes make Shiva. It never
contains a copy of any of them. That is the whole reason adding Krishna
should mostly mean composing existing foundations and features rather
than inventing a second set that drifts from the first.

## Directories that are empty

Only areas with content exist on disk; git does not track empty
directories, and a tree full of placeholders documents nothing. The list
above is the layout — `layout.mjs` is the enforcement — and a directory
appears the first time an asset belongs in it.
