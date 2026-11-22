# Sargas Compendium Manager

Shares one compendium library between two Foundry VTT worlds on the same installation.

Built for a specific situation: two Pathfinder 2e worlds, one Foundry licence, only one world
running at a time. **Enable it in both worlds and they see the same compendiums.** There is
nothing to sync, nothing to wait for, and nothing to check before switching worlds.

- **Foundry:** v14
- **System:** Pathfinder Second Edition (`pf2e`) only
- **Audience:** GM. Players see only what pack ownership allows.

## How it works

Compendiums declared by a *module* live in `Data/modules/<module>/packs/` and are visible to
every world that enables the module. World compendiums live inside the world folder and cannot
be shared. That is the whole sharing mechanism.

The shared compendiums (*Shared Items*, *Shared Actors*, …, grouped in a **Sargas Compendium Manager**
sidebar folder) are declared by a companion module, **Sargas Compendium Manager — Shared Library**
(`sargas-compendium-manager-library`). Both worlds open those same packs and you edit them directly.
There is one copy, so it cannot drift.

A document in the library has the same UUID in every world
(`Compendium.sargas-compendium-manager-library.scm-items.Item.<id>`), so links, macros, and actor
references written in one world work in the other.

### Why two modules

Foundry replaces a module's whole folder when it installs an update, and a module's compendium
content lives inside that folder. The library module holds only the packs, is released once,
and never updates, so updating Sargas Compendium Manager can never touch your content. Foundry
installs it for you as a dependency.

### What Sargas Compendium Manager itself does

Only the things Foundry keeps per world:

- unlocks the shared compendiums so you can edit them;
- carries pack ownership from one world to the other (see *Player visibility*);
- checks the library is intact on every start (see *Safety*);
- brings your existing compendiums into the library (see *Bringing in compendiums*).

## Installation

This is the only URL you need. On Foundry's setup screen, go to **Add-on Modules → Install
Module**, paste it, and click Install:

```
https://github.com/sargas79/sargas-compendium-manager/releases/latest/download/module.json
```

Foundry installs **Sargas Compendium Manager — Shared Library** along with it, as a dependency. The URL
always points at the newest release, so Foundry's update check keeps working from then on.

Then, in each world, enable *Sargas Compendium Manager* in **Manage Modules** and accept the prompt to
also enable the Shared Library.

If *Sargas Compendium Manager — Shared Library* is missing from **Add-on Modules** after installing,
uninstall Sargas Compendium Manager and install it again from the same URL; Foundry offers to install
the dependency during installation.

### Updating from 1.0.x

Click **Update** next to Sargas Compendium Manager in **Add-on Modules**, then check the Shared Library
was installed alongside it (see above). Compendium content stored by 1.0.x is not carried over.
The old "… (Shared Library)" compendiums can then be removed from the status page (see
*Coming from 1.0.x*).

### Updating from 2.0.0

2.1.0 gives every identifier a `sargas-` prefix so it cannot clash with another package, and that
includes the Shared Library's id: it is now `sargas-compendium-manager-library` (it was
`sargas-compendium-library`). Foundry treats that as a new module and installs it alongside the
update.

The old library module stays installed and is no longer used. If you put anything in it, bring it
over with **Bring in compendiums…** (tick *Also show module and system compendiums* to see the old
packs), then uninstall *Compendium Manager — Shared Library* from **Add-on Modules**. Links to the
old library's entries change with it.

### Manual install (development)

Copy this repository into your Foundry user data directory as
`Data/modules/sargas-compendium-manager`, and copy its `library/` folder as
`Data/modules/sargas-compendium-manager-library`. Folder names must match the module ids exactly.

### Releasing

Code releases are built by GitHub Actions from a version tag. The tag is the source of truth for
the version number, so `module.json` does not need editing first:

```
git tag v2.1.1
git push origin v2.1.1
```

The library module is released **once per library id**, from `library/` as committed. The
current one is `library-v2` (`library-v1` was the earlier `sargas-compendium-library`). Foundry
fetches it from that release whenever it installs Sargas Compendium Manager, so keep that release, and
do not publish a second library tag or bump the library's version unless you mean every install
to replace its content. `release-library.yml` explains why.

## Getting started

1. Enable the module in the first world and reload. A welcome window offers to bring in the
   compendiums you already have — or skip it and start filling *Shared Items* and friends.
2. Enable it in the second world. The welcome window shows what is already in the library and
   makes the same offer. Entries that already exist are recognised (see below), so you only
   decide about real differences.

## Daily use

Open a shared compendium, drag things in, edit them. Delete with Foundry's normal delete. That is
all: whatever you saved is there in the other world the next time you open it.

The **Sargas Compendium Manager** button in the compendium sidebar opens a status page: library health,
how many entries each shared compendium holds, which worlds use the library, and **Bring in
compendiums…** The shared compendiums themselves sit in the *Sargas Compendium Manager* folder of
the compendium sidebar; the module puts them there once per world, and leaves them alone if you
move them.

## Bringing in compendiums

One window for all of them at once:

1. **Pick** — tick this world's compendiums (module and system compendiums are a checkbox away).
2. **Preview** — nothing is written yet. Each entry is one of:
   - **new** — will be added;
   - **already in the library** — identical content, skipped;
   - **needs a decision** — the same entry with different content. These are listed with bulk
     buttons; the default is **keep the library version**, so nothing in the library changes
     unless you say so. Other choices: use this world's, or keep both.
3. **Import** — one confirmation, then a progress bar.

Existing entries are recognised by, in order: the same id; the same original pf2e compendium
entry (`_stats.compendiumSource`), which catches the same thing dragged out of the pf2e
compendiums in both worlds; and the same type and name, ignoring case and spacing. The depth is
an option in the window.

Imported entries keep their ids and land in a folder named after the compendium they came from.
Folders are matched by name, so "Homebrew Items / Spells" from either world ends up in one
folder. Options:

- **Point links at the shared library** (on by default): links inside the imported entries that
  point at other imported entries are changed to point at their shared copies.
- **Lock the original compendiums afterwards** (off by default).

Originals are never changed (beyond that optional lock) and never deleted. Running the import
again is harmless: everything already imported shows as *already in the library*.

## Safety

- **Updates cannot touch your content** — it lives in the library module, which never updates.
- **Library health check.** Each world remembers how many entries each shared compendium held.
  If one that had content is suddenly empty, or the library's bookkeeping entry is gone, you get
  one clear error and the module writes nothing until you look. The status page explains what to
  check, and has *I emptied it on purpose* for when you did.
- **Backups** — back up the library from Foundry's setup screen: **Backups → Sargas Compendium Manager —
  Shared Library**. Do this before your first big import.
- The import always previews first, asks before writing, and never deletes from either side.
- The only thing the module ever deletes is an old 1.0.x "… (Shared Library)" compendium, and
  only when you click *Remove* and confirm, and only if it is empty or everything in it is
  already in the shared library.
- The module refuses to run outside pf2e, and refuses to configure a library that records a
  different system.
- Only one GM client (Foundry's active GM) ever writes.

### What it writes

| Location | Written? |
|---|---|
| `Data/modules/sargas-compendium-manager-library/packs/` | yes — through the import, and by you editing the shared compendiums |
| World `compendiumConfiguration` setting | yes — unlock and ownership of the shared compendiums; lock of imported-from compendiums only if you tick that option |
| World settings of this module | yes — the health-check reference counts and the "welcome shown" and "folder placed" flags |
| World compendium folders | yes — creates the *Sargas Compendium Manager* folder once, if the shared compendiums are in no folder |
| Old 1.0.x "… (Shared Library)" world compendiums | deleted only when you confirm *Remove*, and only if nothing in them is missing from the library |
| Foundry application files | **never** |
| `Data/systems/pf2e/**` | **never** — read-only source |
| Other modules' packs and files | **never** |
| Your other compendiums | read-only; the import copies out and never writes back |

No core class is patched or monkey-patched. Integration is through documented hooks and public
document APIs.

## Player visibility

Unchanged from stock Foundry: configure pack ownership per user role in the pack's own
configuration dialog.

Because ownership is a *world* setting, a pack you open to players in one world would still be
closed in the other. With **Carry pack ownership between worlds** on (the default), the module
records the ownership you set and applies it in the other world. Turn it off and each world
keeps its own.

## Settings

| Setting | Default | Effect |
|---|---|---|
| Carry pack ownership between worlds | on | apply one world's pack ownership in the other |
| Debug logging | off | verbose `[sargas-compendium-manager]` console output |

## API

```js
const api = game.modules.get("sargas-compendium-manager").api;
api.open();                                   // status page
api.openImport();                             // import window
const health = await api.checkLibrary();      // { status, counts, shrunk, ... }
const report = await api.previewImport(["world.my-old-items"]);   // writes nothing
await api.applyImport(report);                // defaults: add new, keep library on decisions
```

## Test checklist

Run these in Foundry; results are not claimed here (see *Status*).

1. Installing from the manifest URL installs both modules; enabling the manager prompts to
   enable the library. No console errors on load.
2. The shared compendiums appear in a *Sargas Compendium Manager* sidebar folder and are unlocked.
3. Round trip: create an item in world A → switch to B → present and editable → edit → back to
   A → edit present.
4. A journal link to a shared item resolves in both worlds.
5. Import preview writes nothing; counts are accurate.
6. Import in world A, then the same compendium again → everything *already in the library*.
7. The same pf2e entry dragged into a compendium in each world under different ids is recognised
   in world B's import.
8. Folders: "X / Spells" imported from both worlds ends up as one folder.
9. Link rewriting: an imported journal linking to an imported item opens the shared item.
10. Pack ownership set to OBSERVER in A is in effect in B.
11. Health check: empty a shared compendium outside Foundry (or restore an empty library) → error
    on next start, nothing written; *I emptied it on purpose* clears it.
12. Updating Sargas Compendium Manager from its manifest leaves the library's content untouched.
13. A non-GM user triggers no writes and sees only permitted packs; with two GMs connected only
    the active GM writes.
14. Enabling in a non-pf2e world refuses cleanly and creates nothing.
15. Importing a compendium with 500+ entries completes and shows progress.
16. The sidebar button sits on its own line under *Create Compendium* / *Create Folder*.
17. In a world with 1.0.x "… (Shared Library)" compendiums: a notice on load; the status page
    lists them as empty, already copied, or with entries missing; *Remove* deletes only the first
    two kinds, after confirming.

## Status

Version 2.1.1. Written against the published Foundry v14 API documentation. The scripts are
syntax-checked and the import's matching, hashing, and link rewriting are unit-tested
(`node --test tests/*.test.mjs`), but **the module has not yet run inside Foundry**. Work through
the checklist with the console open; the assumptions to confirm first are that a GM can write to
module packs at runtime in v14 (tests 2–3) and that `relationships.requires` installs the library
automatically (test 1).

## Coming from 1.0.x (the v0.1 design)

The 1.0.x releases kept a second copy of everything in per-world "mirror" compendiums (`… (Shared Library)`).
2.x does not use them, and their name makes them easy to confuse with the real shared library.
From 2.1.1 the status page lists them in each world:

- **empty**, or **all already in the shared library** — *Remove old compendiums* deletes them
  after you confirm.
- **entries not in the shared library yet** — bring them in first with **Bring in compendiums…**
  (they are listed there), then remove them.

Do this in each world: each one has its own copies. Content that 1.0.x stored in its own shared
packs lived inside the manager's folder, which the update replaces.

## Known limitations

- Both worlds must run the same system, and ideally the same pf2e version.
- Only one world may run at a time. This module does not make concurrent worlds safe.
- Player visibility is per pack, not per entry — a Foundry constraint.
- Scenes that reference images under `worlds/<world>/` break in the other world; keep shared
  scene art in a common assets folder.
- Imported content may show as *needs a decision* on a re-run if pf2e migrated it on import (it
  rewrites old system data to its current format). Keeping the library version is always safe.

## Licence

See [LICENSE](LICENSE).
