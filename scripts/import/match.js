import { normalisedName, sourceReference } from "./hash.js";

/**
 * Identity matching for the import window.
 *
 * The same entry created independently in two worlds has different ids, so id equality alone is
 * not enough. The ladder is: id -> original compendium entry -> type + normalised name.
 * A match below the id level is only ever *proposed*: the GM decides unless the content is
 * identical.
 *
 * Pure functions with no Foundry dependency, so they can be unit-tested in Node.
 */

/** Index fields needed to match against a library pack without loading its documents. */
export const MATCH_FIELDS = ["_stats.compendiumSource", "flags.core.sourceId", "type"];

/** How far down the ladder to look. */
export const MATCH_DEPTH = { id: 1, source: 2, name: 3 };

function nameKey(entry) {
  return `${entry.type ?? ""}::${normalisedName(entry.name)}`;
}

/**
 * @typedef {object} Candidate
 * @property {string} _id
 * @property {string} [name]
 * @property {string} [type]
 * @property {string|null} [origin] collection of the source pack it is planned from, or null
 *                                  when it already exists in the library
 */

/**
 * Build a lookup over a library pack's index. Entries planned for creation during the same
 * import are added with `add()` so two selected compendiums cannot both create the same entry.
 * @param {Iterable<object>} libraryIndex
 */
export function createMatchIndex(libraryIndex = []) {
  const byId = new Map();
  const bySource = new Map();
  const byName = new Map();

  const add = (entry, origin = null) => {
    const candidate = { ...entry, origin };
    if (!byId.has(entry._id)) byId.set(entry._id, candidate);
    const source = sourceReference(entry);
    if (source && !bySource.has(source)) bySource.set(source, candidate);
    const key = nameKey(entry);
    if (!byName.has(key)) byName.set(key, candidate);
  };

  for (const entry of libraryIndex) add(entry, null);
  return { byId, bySource, byName, add };
}

/**
 * Find the library counterpart of an incoming document.
 *
 * A document planned from the *same* source compendium is never a match below the id level:
 * two entries in one compendium are distinct by definition, even when they share a name.
 *
 * @param {object} source `toObject()` output of the incoming document
 * @param {ReturnType<typeof createMatchIndex>} index
 * @param {number} depth one of MATCH_DEPTH
 * @param {string} origin collection of the compendium the document comes from
 * @returns {{target: Candidate, via: "id"|"source"|"name"}|null}
 */
export function findMatch(source, index, depth, origin) {
  const usable = (candidate) => candidate && candidate.origin !== origin;

  const byId = index.byId.get(source._id);
  if (byId) return { target: byId, via: "id" };

  if (depth >= MATCH_DEPTH.source) {
    const reference = sourceReference(source);
    const bySource = reference ? index.bySource.get(reference) : null;
    if (usable(bySource)) return { target: bySource, via: "source" };
  }

  if (depth >= MATCH_DEPTH.name) {
    const byName = index.byName.get(nameKey(source));
    if (usable(byName)) return { target: byName, via: "name" };
  }

  return null;
}
