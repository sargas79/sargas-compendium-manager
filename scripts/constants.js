/**
 * Static definitions shared by every part of the module.
 * Nothing here reads game state, so it is safe to import at any lifecycle stage.
 */

export const MODULE_ID = "sargas-compendium-manager";

/**
 * The data-only module that holds the shared packs. It is released once and never updated, so
 * Foundry never replaces its folder (and the content inside it). See PLAN-v2.md §2.2.
 */
export const LIBRARY_ID = "sargas-compendium-library";

/** The module is explicitly scoped to Pathfinder Second Edition (see PLAN.md §2.1). */
export const REQUIRED_SYSTEM = "pf2e";

/** Fixed id of the meta document that carries cross-world state inside the shared library. */
export const META_DOC_ID = "cmmanifestmeta01";

/** Name of the meta document. The leading dot keeps it at the top of the directory listing. */
export const META_DOC_NAME = ".cm-manifest";

/**
 * Every shared document type, one library pack each.
 * `key` is the pack name in the library module's manifest.
 */
export const MANAGED_TYPES = [
  { type: "Actor", key: "cm-actors", label: "Actors" },
  { type: "Item", key: "cm-items", label: "Items" },
  { type: "JournalEntry", key: "cm-journals", label: "Journal Entries" },
  { type: "RollTable", key: "cm-tables", label: "Roll Tables" },
  { type: "Macro", key: "cm-macros", label: "Macros" },
  { type: "Scene", key: "cm-scenes", label: "Scenes" },
  { type: "Cards", key: "cm-cards", label: "Cards" }
];

/** The journal pack always exists: it stores the meta document. */
export const META_PACK_KEY = "cm-journals";

/** @param {string} key */
export function sharedPackId(key) {
  return `${LIBRARY_ID}.${key}`;
}

/** @param {string} type */
export function definitionForType(type) {
  return MANAGED_TYPES.find((d) => d.type === type) ?? null;
}

/** @param {string} collection A pack collection id such as `sargas-compendium-library.cm-items`. */
export function definitionForShared(collection) {
  return MANAGED_TYPES.find((d) => sharedPackId(d.key) === collection) ?? null;
}

/**
 * Resolve the document class for a managed type without relying on deprecated globals.
 * @param {string} type
 */
export function documentClass(type) {
  return CONFIG[type]?.documentClass ?? null;
}

/** The CompendiumCollection class, namespaced in v14 with a fallback to the global. */
export function compendiumCollectionClass() {
  return foundry?.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
}

/**
 * True on exactly one client: the GM Foundry considers active. Every write the module makes is
 * gated on this, so two GMs connected to the same world never do the work twice.
 */
export function isPrimaryGM() {
  if (!game.user?.isGM) return false;
  const active = game.users?.activeGM;
  return active ? active.id === game.user.id : true;
}
