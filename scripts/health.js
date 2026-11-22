import { MANAGED_TYPES, definitionForShared, isPrimaryGM } from "./constants.js";
import { SETTINGS, getSetting, setSetting } from "./settings.js";
import { libraryActive, libraryCounts, missingSharedPacks } from "./packs/library.js";
import { readMeta } from "./meta.js";
import { log } from "./log.js";

/**
 * Library health.
 *
 * With one shared copy there is no second copy to fall back on, so the module watches for the
 * one failure that matters: the library suddenly being empty (for example because its folder was
 * replaced or deleted outside Foundry). Each world remembers what it last saw in a world-scoped
 * setting, which survives whatever happened to the library.
 *
 * When the check fails the module writes nothing to the library until the GM looks.
 */

/** @typedef {{collection: string, label: string, was: number, now: number}} ShrunkPack */

/**
 * @typedef {object} Health
 * @property {"ok"|"missing-module"|"missing-packs"|"shrank"} status
 * @property {string[]} missingPacks
 * @property {ShrunkPack[]} shrunk
 * @property {boolean} metaMissing
 * @property {Record<string, number|null>} counts
 */

/** @type {Health|null} */
let last = null;
let countTimer = null;

/** The most recent health result, for the status page. */
export function lastHealth() {
  return last;
}

function labelFor(collection) {
  return definitionForShared(collection)?.label ?? collection;
}

/**
 * Compare what is in the library now with what this world saw last time.
 * Pure read: never writes.
 * @returns {Promise<Health>}
 */
export async function checkLibrary() {
  if (!libraryActive()) {
    last = { status: "missing-module", missingPacks: [], shrunk: [], metaMissing: false, counts: {} };
    return last;
  }

  const missingPacks = missingSharedPacks();
  const counts = await libraryCounts();
  const meta = await readMeta();
  const recorded = getSetting(SETTINGS.recordedCounts) ?? {};
  const wasCounts = recorded.counts ?? {};

  const shrunk = [];
  for (const [collection, now] of Object.entries(counts)) {
    const was = Number(wasCounts[collection] ?? 0);
    if (was > 0 && now === 0) shrunk.push({ collection, label: labelFor(collection), was, now });
  }
  const metaMissing = recorded.hadMeta === true && !meta;

  let status = "ok";
  if (shrunk.length || metaMissing) status = "shrank";
  else if (missingPacks.length === MANAGED_TYPES.length) status = "missing-packs";

  last = { status, missingPacks, shrunk, metaMissing, counts };
  if (status !== "ok") log.warn("Library health check failed.", last);
  return last;
}

/**
 * Remember the current library contents as this world's reference point.
 * @param {Record<string, number|null>} [counts] pass to avoid re-indexing
 */
export async function recordCounts(counts) {
  if (!isPrimaryGM()) return;
  const current = counts ?? (await libraryCounts());
  const clean = Object.fromEntries(Object.entries(current).filter(([, n]) => typeof n === "number"));
  const hadMeta = !!(await readMeta());
  await setSetting(SETTINGS.recordedCounts, { counts: clean, hadMeta, at: Date.now() });
}

/**
 * The GM confirmed the change was deliberate (they emptied a pack on purpose).
 * Takes the current state as the new reference and clears the warning.
 */
export async function acceptCurrentLibrary() {
  await recordCounts();
  return checkLibrary();
}

/** Keep the reference counts current while the GM adds and removes content. */
function scheduleCountRecord() {
  if (last?.status !== "ok") return; // never overwrite the reference while a warning is open
  if (countTimer) clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    countTimer = null;
    recordCounts().catch((err) => log.error("Unable to record library counts.", err));
  }, 10_000);
}

let watching = false;

export function watchLibraryCounts() {
  if (watching) return;
  watching = true;
  const onChange = (document, userId) => {
    if (userId !== game.user.id || !isPrimaryGM()) return;
    if (!document?.pack || !definitionForShared(document.pack)) return;
    scheduleCountRecord();
  };
  for (const { type } of MANAGED_TYPES) {
    Hooks.on(`create${type}`, (document, _options, userId) => onChange(document, userId));
    Hooks.on(`delete${type}`, (document, _options, userId) => onChange(document, userId));
  }
}
