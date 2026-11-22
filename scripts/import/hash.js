/**
 * Content comparison for the import window.
 *
 * Pure functions with no Foundry dependency, so they can be unit-tested in Node.
 * Documents are compared as opaque objects: no system data path is ever read.
 */

const MODULE_ID = "sargas-compendium-manager";

/** Top-level fields that say where a document sits, not what it is. */
const PLACEMENT_FIELDS = ["_id", "folder", "sort", "ownership"];

/** Deterministic JSON: object keys sorted, arrays kept in order. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** 32-bit FNV-1a, rendered as 8 hex characters. */
export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Remove `_stats` at every depth. Foundry rewrites creation and modification times, including
 * on embedded documents (an actor's items), whenever a document is copied, so they must not
 * count as a difference or a re-run of the import would never see "already in the library".
 */
function stripStatsDeep(value) {
  if (Array.isArray(value)) {
    for (const item of value) stripStatsDeep(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  delete value._stats;
  for (const key of Object.keys(value)) stripStatsDeep(value[key]);
}

function stripOwnFlags(data) {
  if (!data.flags) return;
  delete data.flags[MODULE_ID]; // v0.1 bookkeeping, if any survives
  if (!Object.keys(data.flags).length) delete data.flags;
}

/**
 * Hash of what a document *is*, ignoring where it sits and when it was touched.
 * Two copies of the same entry in different packs, folders, or worlds hash the same.
 * @param {object} source A document's `toObject()` output.
 */
export function contentHash(source) {
  const data = structuredClone(source);
  for (const field of PLACEMENT_FIELDS) delete data[field];
  stripStatsDeep(data);
  stripOwnFlags(data);
  return fnv1a(stableStringify(data));
}

/** The original compendium entry a document was dragged from, used for duplicate detection. */
export function sourceReference(source) {
  return source?._stats?.compendiumSource ?? source?.flags?.core?.sourceId ?? null;
}

/** Normalised name used as the weakest duplicate signal. */
export function normalisedName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
