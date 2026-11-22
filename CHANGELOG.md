# Changelog

All notable changes to this module are documented here.

## [2.0.0] — 2026-11-22

Released as 2.0.0 because 0.1.0 was published as v1.0.0 and v1.0.1, and a lower version would
never be offered as an update. Breaking: document UUIDs change and a new dependency is required.

One shared library, nothing to sync. Enable the module in both worlds and they see the same
compendiums. See PLAN-v2.md for the review of v0.1 and the reasoning.

### Changed
- Both worlds now edit the shared compendiums directly. The per-world mirror compendiums, the
  push/pull sync engine, the pending-edit queue, the deletion queue, and `_conflicts` folders are
  gone. Deleting works like any other compendium.
- The shared compendiums move to a new data-only companion module, **Compendium Manager — Shared
  Library** (`sargas-compendium-library`), installed automatically as a dependency. It is released
  once and never updates, so updating Compendium Manager can no longer erase the library.
  Document UUIDs are now `Compendium.sargas-compendium-library.cm-*.<Type>.<id>`.
- The merge wizard is replaced by **Bring in compendiums…**: pick several compendiums at once, one
  preview that lists only real decisions (default: keep the library version), folders matched by
  name, optional link rewriting and locking of the originals, and a progress bar.
- The manager window is now a status page: library health, entry counts, and which worlds use
  the library.
- Settings reduced to *Carry pack ownership between worlds* and *Debug logging*.

### Added
- Library health check: warns, and writes nothing, if a shared compendium that had content is
  suddenly empty.
- A one-time welcome window per world.
- Unit tests for matching, hashing, and link rewriting, run in the release workflow.
- `release-library.yml` publishes the library module from a `library-v*` tag.

### Fixed (v0.1 defects that no longer apply)
- Accepting a module update would have wiped the shared library.
- Edits made directly in a shared pack were ignored, then overwritten.
- Deleted documents came back on the next start until confirmed.
- Merging the second world duplicated folders with the same name.

### Removed
- API: `syncNow`, `push`, `pull`, `dryRun`, `applyReport`, `applyAllDeletions`. Use
  `previewImport` / `applyImport` / `checkLibrary`.

## [0.1.0] — 2026-08-20

Initial release. Written against the published Foundry v14 API documentation; not yet run
inside Foundry (see README *Status*).

### Added
- Seven shared module compendiums (Actors, Items, Journal Entries, Roll Tables, Macros, Scenes,
  Cards) that every world enabling the module can see.
- World mirror packs created automatically per world, with matching pack names so document UUIDs
  stay stable across worlds.
- Two-way sync between mirror and shared library: pull on startup, debounced push after edits,
  and a manual **Sync now**.
- Change detection by content hash, with per-document revision bookkeeping stored in module
  flags and a meta document that travels inside the shared library.
- Conflict handling that keeps the shared version and preserves the local one in a `_conflicts`
  folder.
- Deletion queue: removing a document from a mirror pack never removes the shared copy until
  the GM confirms.
- Merge wizard for adopting existing world compendiums, with a mandatory dry run and duplicate
  detection by id, original compendium source, or name and type.
- Automatic per-world unlocking of managed packs, and optional propagation of pack ownership
  between worlds.
- GM-only manager window, module settings, English localisation, and a public API on
  `game.modules.get("compendium-manager").api`.
- Manifest-URL distribution: a tagged push builds and publishes `module.json` and `module.zip`
  as GitHub release assets, with the version taken from the tag.

### Notes
- Scoped to Pathfinder Second Edition; the module refuses to initialise on any other system.
- No Foundry core file or pf2e system file is created, edited, or deleted, and no core class is
  patched.
