import { LIBRARY_ID, MANAGED_TYPES, META_DOC_ID, META_PACK_KEY, sharedPackId } from "../constants.js";
import { log } from "../log.js";

/**
 * The shared library: the packs declared by the data-only library module.
 * Every world that enables the library sees these same packs, so there is nothing to sync.
 */

/** True when the library module is installed and enabled in this world. */
export function libraryActive() {
  return game.modules.get(LIBRARY_ID)?.active === true;
}

/**
 * Resolve a library pack.
 * @param {{key: string}} definition
 * @returns {CompendiumCollection|null}
 */
export function getSharedPack(definition) {
  return game.packs.get(sharedPackId(definition.key)) ?? null;
}

/** The pack that stores the meta document. */
export function getMetaPack() {
  return game.packs.get(sharedPackId(META_PACK_KEY)) ?? null;
}

/**
 * Verify every expected pack is present. A missing pack means a broken library install, and is
 * reported rather than silently skipped.
 * @returns {string[]} keys of missing packs
 */
export function missingSharedPacks() {
  const missing = MANAGED_TYPES.filter((definition) => !getSharedPack(definition)).map((d) => d.key);
  if (missing.length) log.warn("Library packs missing:", missing);
  return missing;
}

/** Definitions whose library pack exists, paired with the pack. */
export function availablePacks() {
  return MANAGED_TYPES.map((definition) => ({ definition, pack: getSharedPack(definition) })).filter(
    (entry) => !!entry.pack
  );
}

/** Collection ids of every library pack present in this world. */
export function libraryCollections() {
  return availablePacks().map(({ pack }) => pack.collection);
}

/**
 * Document counts per library pack, not counting the meta document.
 * Reads only the index, never full documents.
 * @returns {Promise<Record<string, number>>} collection -> count
 */
export async function libraryCounts() {
  const counts = {};
  for (const { pack } of availablePacks()) {
    try {
      const index = await pack.getIndex();
      counts[pack.collection] = index.size - (index.has(META_DOC_ID) ? 1 : 0);
    } catch (err) {
      log.error(`Unable to index ${pack.collection}.`, err);
      counts[pack.collection] = null;
    }
  }
  return counts;
}
