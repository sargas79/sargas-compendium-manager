import { isPrimaryGM } from "../constants.js";
import { previewImport } from "../import/importer.js";
import { MATCH_DEPTH } from "../import/match.js";
import { log } from "../log.js";

/**
 * Version 1.0.x created a "mirror" compendium in every world, one per document type, named
 * `world.cm-<type>` and labelled "<Type> (Shared Library)". 2.x does not use them, and their
 * name makes them easy to mistake for the real shared library, so the status page offers to
 * remove them.
 *
 * A leftover is only removable when nothing would be lost: it is empty, or every entry in it is
 * already in the shared library with the same content. Anything else has to be brought in first.
 */

const V1_MIRROR_NAMES = ["cm-actors", "cm-items", "cm-journals", "cm-tables", "cm-macros", "cm-scenes", "cm-cards"];

/** v1.0.x bookkeeping entry; never content, so it does not count. */
const V1_META_NAME = ".cm-manifest";

/** @returns {CompendiumCollection[]} the v1.0.x mirror compendiums still in this world */
export function leftoverPacks() {
  return game.packs.filter((pack) => V1_MIRROR_NAMES.some((name) => pack.collection === `world.${name}`));
}

/**
 * Look inside each leftover and decide whether it can go.
 * @returns {Promise<Array<{collection: string, label: string, count: number, missing: number,
 *   removable: boolean, failed: boolean}>>}
 */
export async function inspectLeftovers() {
  const rows = [];
  for (const pack of leftoverPacks()) {
    const row = { collection: pack.collection, label: pack.title, count: 0, missing: 0, removable: false, failed: false };
    try {
      const index = await pack.getIndex();
      row.count = [...index].filter((entry) => entry.name !== V1_META_NAME).length;
      if (row.count) {
        const report = await previewImport([pack.collection], { depth: MATCH_DEPTH.name });
        const entries = report.packs.find((p) => p.source === pack.collection)?.entries ?? null;
        // No report means the library has nowhere to put these entries: treat them all as missing.
        row.missing = entries
          ? entries.filter((entry) => entry.name !== V1_META_NAME && entry.status !== "identical").length
          : row.count;
      }
      row.removable = row.missing === 0;
    } catch (err) {
      log.error(`Unable to inspect ${pack.collection}.`, err);
      row.failed = true;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Delete the given leftovers, re-checking each one first so nothing that is not already in the
 * library can be deleted. Permanent: callers confirm with the GM before calling this.
 * @param {string[]} collections
 * @returns {Promise<{removed: string[], kept: string[]}>}
 */
export async function removeLeftovers(collections) {
  const removed = [];
  const kept = [];
  if (!isPrimaryGM()) return { removed, kept: [...collections] };

  const wanted = new Set(collections);
  for (const row of await inspectLeftovers()) {
    if (!wanted.has(row.collection)) continue;
    const pack = game.packs.get(row.collection);
    if (!row.removable || row.failed || !pack) {
      kept.push(row.collection);
      continue;
    }
    try {
      await pack.deleteCompendium();
      removed.push(row.collection);
      log.info(`Removed the v1.0.x leftover compendium ${row.collection}.`);
    } catch (err) {
      log.error(`Unable to remove ${row.collection}.`, err);
      kept.push(row.collection);
    }
  }
  return { removed, kept };
}
