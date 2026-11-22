# Compendium Manager — Shared Library

Data-only companion to [Compendium Manager](https://github.com/sargas79/sargas-compendium-manager).

This module holds the shared compendium packs and nothing else: no scripts, no styles. Every
world that enables it sees the same packs, which is how two worlds share one library.

## Why it is a separate module

Foundry replaces a module's whole folder when it installs an update, and a module's compendium
packs live inside that folder. Keeping the content in a module that is released once and never
updated means updating Compendium Manager can never touch it.

Foundry installs it automatically as a dependency of Compendium Manager, from the fixed
`library-v1` release, and never offers it an update. You never need to install it by hand.

## Adding packs

Because this module never updates, its `module.json` is yours to edit. To split, say, items into
"Homebrew Spells" and "Homebrew Equipment", add entries to `packs` (and to `packFolders`) and
restart Foundry. Compendium Manager unlocks and carries ownership only for the seven packs it
ships with.

## Backups

Back this module up from Foundry's setup screen: **Backups → Compendium Manager — Shared Library**.
