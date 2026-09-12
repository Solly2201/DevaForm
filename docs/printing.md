# Export & Print Pipeline — Status

## Implemented today (Divine Studio → Export)

- **Studio render**: PNG capture of the live viewport.
- **Configuration export**: the full serialized `CharacterConfiguration`
  (JSON) — deterministic, versioned, reconstructable.
- **Posed STL**: the assembled statue (all components, world transforms
  baked) exported as binary STL via `engine/printExport.ts`.
- **Printability report** (only checks that actually run):
  - dimensions at the selected statue height (15/23/30 cm)
  - triangle and component counts
  - base contact (lowest point vs. build plate)
  - watertight shell and thin-feature analysis are explicitly reported as
    **not yet validated** — they belong to the manufacturing pipeline below.

## Manufacturing pipeline (Phase D — not yet implemented)

```
CharacterConfiguration + pinned asset versions
  -> resolve print-resolution assets
  -> apply morphs, bake pose
  -> boolean union into a single shell
  -> repair / watertight validation
  -> thin-wall, floating-part, balance analysis
  -> STL / 3MF for production
```

This runs server-side in Python/Blender workers (`tools/blender/`), fed by
the same configuration JSON the editor saves. Reproducibility is already
guaranteed at the data layer: every save and every future order stores the
configuration plus exact asset versions (`CharacterVersion.assetVersions`,
`CreationSnapshot` in the commerce model).

## Honest limitations

- The STL is a set of overlapping component shells, not one watertight
  solid. Many slicers handle overlapping shells, but it is **not** claimed
  print-ready.
- Dimensions assume uniform scaling to the chosen height.
- No support-structure, orientation or balance analysis yet.
