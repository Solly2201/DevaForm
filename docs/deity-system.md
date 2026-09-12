# The Deity System

Divine Studio is a generic deity customization environment. Everything
deity-specific lives in data; the engine, UI shell, persistence and export
tooling are shared.

## DeityDefinition

Declared in `packages/asset-system/src/deities.ts`:

| Field | Meaning |
|---|---|
| `id`, `name`, `epithet`, `description`, `accent` | Identity + presentation |
| `available` | `false` renders a "coming soon" page; the studio never loads |
| `assets` | The deity's asset manifest (see asset-specification.md) |
| `categories` | Sidebar/panel structure — pure data, rendered generically |
| `posePresets` | Named joint rotation sets |
| `armOptions` | Which arm configurations the Body panel offers |
| `createDefaultConfiguration` | Factory for a valid starting configuration |

The active definition reaches editor components through `DeityProvider` /
`useDeity()` (`apps/web/src/state/deityContext.tsx`); the `/studio/[deity]`
route selects it. No editor component imports a deity directly.

## Adding a deity (checklist)

1. **Skeleton.** The canonical skeleton in `character-schema/src/skeleton.ts`
   currently serves Ganesha-class anatomy (4 arm chains, trunk chain). A new
   deity either maps onto it (Hanuman, Krishna) or extends the joint list —
   unknown joints are ignored by old configurations, missing joints rest, so
   extension is additive. Deities with radically different anatomy will move
   the skeleton reference into DeityDefinition (planned; see architecture).
2. **Asset manifest.** Author `manifests/<deity>.ts`: parts per slot,
   attachments per socket, grips for hand items, GLB paths for sculpted
   assets. Run `pnpm validate-assets`.
3. **Categories.** Compose sidebar categories from part slots and sockets.
4. **Pose presets.** Author joint rotation sets (with `rootOffset` for
   seated asanas).
5. **Defaults.** A `createDefault<Deity>Configuration()` in
   character-schema, referenced by the definition.
6. **Register.** Add the definition to `DEITIES` with `available: true`.
7. **Tests.** The deity registry tests validate every available deity's
   default configuration automatically.

## Configuration compatibility

`CharacterConfiguration.deity` currently validates as `"ganesha"` (the only
deity with valid configurations). When a second deity ships, this widens to
the enum of available deity ids — a schema-version bump with a trivial
migration, already supported by the serialization layer.
