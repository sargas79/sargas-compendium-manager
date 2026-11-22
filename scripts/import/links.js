/**
 * Link rewriting for imported documents.
 *
 * Imported documents keep their ids, so a link such as
 *   @UUID[Compendium.world.homebrew.Item.abcdefghijklmnop]
 * can be pointed at the shared copy by swapping the pack:
 *   @UUID[Compendium.sargas-compendium-manager-library.scm-items.Item.abcdefghijklmnop]
 *
 * This is a plain string replacement over the whole document, so it reaches journal text, item
 * descriptions, and macro code alike without reading any system data path. Only links to
 * documents that have a counterpart in the library are touched; everything else is left exactly
 * as it was.
 *
 * Pure functions with no Foundry dependency, so they can be unit-tested in Node.
 */

const ID = "[A-Za-z0-9]{16}";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a link map.
 * @returns {{add: Function, rewrite: Function, size: number}}
 */
export function createLinkMap() {
  /** sourceCollection -> Map<oldId, {collection, type, id}> */
  const bySource = new Map();
  let compiled = null;

  return {
    /**
     * @param {string} sourceCollection e.g. `world.homebrew`
     * @param {string} oldId
     * @param {{collection: string, type: string, id: string}} target
     */
    add(sourceCollection, oldId, target) {
      if (!bySource.has(sourceCollection)) bySource.set(sourceCollection, new Map());
      bySource.get(sourceCollection).set(oldId, target);
      compiled = null;
    },

    get size() {
      let n = 0;
      for (const ids of bySource.values()) n += ids.size;
      return n;
    },

    /**
     * Rewrite every mapped link inside a document's data.
     * @param {object} data `toObject()` output; not modified
     * @returns {{data: object, changed: number}}
     */
    rewrite(data) {
      if (!bySource.size) return { data, changed: 0 };
      if (!compiled) compiled = compile(bySource);

      let changed = 0;
      const text = JSON.stringify(data).replace(compiled.pattern, (match, ...groups) => {
        const named = groups.at(-1);
        const collection = named.c1 ?? named.c2;
        const id = named.i1 ?? named.i2;
        const target = bySource.get(collection)?.get(id);
        if (!target) return match;
        changed += 1;
        const uuid = `Compendium.${target.collection}.${target.type}.${target.id}`;
        // Legacy @Compendium[pack.id] links become @UUID links, keeping any {label} that follows.
        return named.c2 ? `@UUID[${uuid}]` : uuid;
      });
      return { data: changed ? JSON.parse(text) : data, changed };
    }
  };
}

function compile(bySource) {
  const collections = [...bySource.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const packs = collections.join("|");
  // Current form: Compendium.<pack>.<Type>.<id>, and the older Compendium.<pack>.<id>.
  const modern = `Compendium\\.(?<c1>${packs})\\.(?:[A-Za-z]+\\.)?(?<i1>${ID})(?![A-Za-z0-9])`;
  // Legacy form: @Compendium[<pack>.<id>]
  const legacy = `@Compendium\\[(?<c2>${packs})\\.(?<i2>${ID})\\]`;
  return { pattern: new RegExp(`${legacy}|${modern}`, "g") };
}
