# Compendium Manager v0.2 — "Enable it in both worlds and forget it"

Status: **approved 2026-11-22 — one library, no sync (§2), with a separate data module, no v0.1
migration.** Implemented in v0.2.0; not yet run inside Foundry.

Goal from the brief: enable the module in both worlds and they stay in sync, with no buttons
to press, no counts to watch, and no per-compendium wizard runs before it is usable.

---

## 1. Review of v0.1

### 1.1 Why it feels complex

| What the GM has to do today | Where it comes from |
|---|---|
| Learn two sets of compendiums: `Shared Items` and `Shared Items (Shared Library)`, and only edit one of them | module packs + world mirror packs, both visible and both unlocked |
| Run the merge wizard once per compendium, per world, with a dry run and a choice per entry | `merge-app.js`, one source pack at a time |
| Check that "pending edits" is zero before switching worlds | dirty queue is world-scoped, push is debounced |
| Confirm every deletion in the manager, or the document comes back | tombstone queue + pull re-creates missing docs |
| Tidy up a `_conflicts` folder | conflict handling copies local versions aside |
| Understand six settings (auto sync, delay, ownership, confirm deletions, matching depth, types) | `settings.js` |

Most of this exists to keep **two copies** of every document in step. The copy is the problem.

### 1.2 Why there are two copies, and why that reason does not hold

PLAN.md §1 says the mirror "pays for itself" because a mirror pack has the same name in both
worlds, so `Compendium.world.cm-items.Item.<id>` is the same UUID everywhere.

Module packs already have that property: `Compendium.sargas-compendium-manager.cm-items.Item.<id>`
is the same in every world that enables the module. The mirror adds no UUID stability. What it
does add is a second copy, and every piece of sync machinery that comes with keeping it right.

### 1.3 Defects found

Ranked by impact. None of these has been seen in Foundry yet, because v0.1 has not run there;
they come from reading the code.

1. **Updating the module from its manifest will erase the shared library.** Foundry replaces a
   module's folder when it installs an update. The shared packs live inside this module's folder
   (`packs/cm-*`), and `module.zip` ships those folders empty (`release.yml:80`). The first time
   Foundry offers an update and you accept, the library is gone. Mirrors keep a copy, but nothing
   pushes it back: push only sends documents in the dirty queue. *Must be verified with a
   throwaway update, but this is a well-known Foundry behaviour and the redesign should assume it.*
2. **Edits made directly in a shared pack never reach the mirror.** Pull decides what changed by
   comparing the `hash` stored in module flags (`engine.js:110-112`). A direct edit does not
   touch those flags, so the hashes still match and pull skips it. The next push of that document
   from either world then overwrites the direct edit. The shared packs are unlocked and sit in the
   sidebar, so this is an easy mistake. README test 9 describes behaviour that will not happen.
3. **Deleting from a mirror does not stick.** The deletion is queued, but on the next start pull
   finds the document in the shared pack and creates it again in the mirror (`engine.js:104-107`).
   Until the GM confirms in the manager, deleted things keep coming back.
4. **Folder name collisions create duplicates.** The merge wizard copies folders by id
   (`folders.js:60`). The second world's "Spells" folder has a different id from the first
   world's, so the shared pack ends up with two "Spells" folders. PLAN.md §4.3 says they merge.
5. **Folders can never be deleted.** `syncFolders` only creates and updates, so a folder deleted
   in a mirror is recreated by the next pull.
6. **An edit made while a sync is running can be left behind.** `push()` returns early if a sync
   is already running (`engine.js:263`), and nothing reschedules it. The edit waits for another
   edit or a restart — which is exactly the "pending is not zero" trap before switching worlds.
7. **One settings write per document.** `enqueueDirty` and `clearDirty` each rewrite the whole
   world setting (`state.js:23-33`). A 500-document push is 500 setting writes, each broadcast to
   every client.

---

## 2. Proposal: one library, nothing to sync

### 2.1 The idea

Drop the mirror packs. Both worlds open **the same module packs** and you edit them directly.
There is one copy, so there is nothing to push, pull, queue, or reconcile, and it cannot drift.
Switching worlds needs no preparation: whatever you saved is already there.

The module's remaining job is the small amount of state that Foundry keeps per world:

- unlocking the shared packs (already done by `config.js`);
- carrying pack ownership from one world to the other (already done by `config.js`);
- refusing to run against a library built for another system (already done in `module.js`).

### 2.2 Fixing defect 1: move the library into its own module

The packs move out of `sargas-compendium-manager` into a second, data-only module,
**`sargas-compendium-library`**, that holds nothing but `module.json` and the seven pack folders.

- It is released once (`library-v1`) and its manifest URL points at that fixed tag, so Foundry
  never offers it an update and never replaces its folder.
- The code module declares it in `relationships.requires`. Installing the manager from its
  manifest makes Foundry install the library too, and enabling the manager in a world prompts
  to enable the library. From the GM's side it is still "install one thing, enable it".
- Code updates ship as before and can no longer touch your content.
- Because the library never updates, you are free to add more packs to its `module.json`
  later (say, separate "Homebrew Spells" and "Homebrew Equipment" item packs).
- Both modules group their packs in a "Shared Library" sidebar folder via `packFolders`.

### 2.3 What the GM sees

**Install** (once): paste the manager's manifest URL. Foundry installs both modules.

**First world:** enable *Compendium Manager*, accept the dependency prompt, reload. A welcome
window opens once:

> The shared library is ready and empty. Do you want to bring in compendiums you already have?
> **[Choose compendiums…]**  **[Not now]**

**Second world:** same steps. The welcome window shows what is already in the library
("212 items, 40 actors, 18 journals from *Thar - Calamity*") and makes the same offer.

**Daily use:** open *Shared Items*, drag things in, edit them. That is all. There is no sync
button, no pending count, and deletions behave like any other Foundry compendium (Foundry's own
delete confirmation, no queue).

**Manager window** (from the sidebar button) becomes a status page:

- library health (ok / warning, see §2.5), document counts per pack, which world last wrote;
- **Bring in compendiums…**
- a link to Foundry's own *Backups* screen for the library module.

### 2.4 Bringing in existing compendiums (replaces the merge wizard)

One window for every compendium at once, instead of one run per compendium:

1. **Pick.** A checklist of this world's compendiums that hold a supported document type, with
   document counts. Each one maps automatically to the shared pack of its type.
2. **Preview.** One summary for the whole selection, from the same id → original pf2e entry →
   type + name ladder `match.js` uses today:
   - *New* — will be added. No decision needed.
   - *Already in the library* (identical content) — skipped. No decision needed.
   - *Needs a decision* — the same entry with different content. Only these are listed, grouped
     by compendium, collapsed by default, with bulk buttons at the top and a sensible default
     already chosen: **keep the library version** (nothing in the library changes unless you
     say so). Per-entry options stay: keep library / use this world's / keep both.
3. **Import.** One confirmation, then a progress bar. Content keeps its ids. Each source
   compendium's documents land in a folder named after it, and folders are matched **by name
   path**, not id, so the second world's "Spells" joins the first world's (fixes defect 4).
4. **Afterwards** (two opt-in checkboxes on the confirm step):
   - *Lock the original compendiums* so you do not keep editing the old copy by accident.
   - *Point links at the shared library*: in the imported documents, rewrite
     `@UUID[Compendium.world.<old-pack>.<Type>.<id>]` to the shared pack when that id was imported.
     Generic string replacement over the whole document; no system data paths are read.

The originals are never modified (beyond the optional lock) and never deleted. Running it again
is harmless: everything already imported shows as *Already in the library*.

### 2.5 Safety without a second copy

Removing the mirror removes the accidental backup it provided, so v0.2 adds cheap guards
instead:

- **Library-shrank warning.** Each world records the library's per-pack document counts in a
  world setting on every start. If a pack that had content is suddenly empty, or the meta
  document is missing while this world remembers it, the GM gets one clear error with what to
  check (the library module's folder, Foundry's Backups screen), and the module changes nothing.
- **Backups** use Foundry's built-in package backups (v11+) for `sargas-compendium-library`.
  The manager links to it; no custom export code.
- System guard and pf2e version-drift warning stay as they are.
- "Only one world at a time" is still required, as it is for every world on a single licence.

### 2.6 What changes in the code

| File | Fate |
|---|---|
| `sync/engine.js`, `sync/watcher.js`, `sync/state.js`, `sync/deletions.js`, `sync/revision.js` | removed |
| `packs/mirror.js` | removed (replaced by a one-off v0.1 migration, §2.8) |
| `sync/folders.js` | reduced to name-path folder import for §2.4 |
| `merge/match.js` | kept; `chash` computed on the fly instead of read from flags |
| `merge/adopt.js`, `ui/merge-app.js`, `templates/merge.hbs` | rewritten as the multi-pack import (§2.4) |
| `ui/manager-app.js`, `templates/manager.hbs` | rewritten as the status page (§2.3) |
| `packs/config.js`, `meta.js` | kept; pack ids point at the library module |
| new `ui/welcome.js` | first-run window |
| new `health.js` | library-shrank check (§2.5) |
| `module.json` | packs removed, `requires` the library, `packFolders` |
| new `library/module.json` + `library/packs/*` | the data module |
| `release.yml` | second job for `library-v*` tags |

Estimated at well under half the code; in practice the scripts, templates, styles, and strings
landed at about the same size as v0.1 (~2,560 lines). The removed sync engine was replaced by a
richer import (multi-pack preview, link rewriting, name-path folders) and the health check.
What shrank is the part that can go wrong at runtime: nothing runs on every edit any more.

### 2.7 Settings after v0.2

| Setting | Default | Note |
|---|---|---|
| Carry pack ownership between worlds | on | unchanged |
| Debug logging | off | unchanged |

Removed: *Sync automatically*, *Auto sync delay*, *Confirm deletions* (nothing left to sync or
queue), *Managed types* (unused packs simply stay empty). *Duplicate detection* moves into the
import window as a dropdown, where it is actually used.

### 2.8 Migration from v0.1 — dropped

Dropped by decision 3 (§5): v0.1 holds no content worth keeping. Kept here as a record.

Only relevant if v0.1 has been used with real content. On first v0.2 start, if `world.cm-*`
mirror packs exist and hold documents, the welcome window offers to bring them in through the
same import flow (§2.4), with link rewriting from `Compendium.world.cm-*` on by default. Then it
offers to lock the old mirror packs, or delete them after a separate confirmation. The v0.1
shared packs inside the manager's own folder are assumed lost to the update (defect 1).

---

## 3. Alternative considered: keep the mirrors, automate them

If keeping a full copy inside each world matters more than simplicity — for example so a world
keeps its content even with the module disabled — the mirror design can be made hands-free:

- move the shared packs into the library module anyway (defect 1 applies equally);
- lock the shared packs and hide them in a collapsed sidebar folder, so the mirror is the only
  thing you edit (defect 2);
- push each edit immediately instead of after a delay, and push leftovers before pulling on start;
- propagate deletions automatically into a recoverable trash folder in the library, instead of a
  confirmation queue (defect 3);
- sync folder deletions and match folders by name (defects 4–5);
- three-way conflict detection against the last common hash, so `_conflicts` copies only appear
  when both worlds genuinely changed the same document;
- rebuild the library from a world's mirror if the library-shrank check fires.

It reaches the same "enable and forget" experience, but keeps every moving part of v0.1 and adds
more, and the GM still sees two sets of packs. I do not recommend it unless the world-local copy
is something you specifically want.

---

## 4. Milestones

| # | Deliverable | Verifiable by |
|---|---|---|
| M0 | Throwaway test: update a module with content in its packs from a manifest | confirms defect 1 and the need for the library module |
| M1 | Library module + `requires` + `packFolders`; code module points at it; mirrors and sync engine removed | install from manifest pulls in both; an item saved in world A is in world B |
| M2 | Ownership carry and health check against the library module | ownership set in A applies in B; emptying a pack triggers the warning |
| M3 | Multi-pack import with preview, name-path folders, opt-in lock | second world import shows only real decisions; no duplicate folders |
| M4 | Link rewriting, welcome window, v0.1 migration | links inside imported journals open the shared copy |
| M5 | Status page, README, CHANGELOG, test checklist | full checklist run in Foundry |

---

## 5. Decisions needed before implementation

1. **Approach:** ~~one library with no sync (§2), or automated mirrors (§3)?~~
   **Decided 2026-11-22: one library, no sync (§2).** §3 is kept only as the record of what was
   considered.
2. **Second module:** **Decided: yes**, ship the data-only `sargas-compendium-library`.
3. **v0.1 data:** **Decided: nothing to keep.** §2.8 (migration) is dropped; v0.1 mirror packs,
   if any exist, are left alone and can be deleted by hand.

Go-ahead to implement given 2026-11-22.
