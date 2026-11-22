import { documentClass } from "../constants.js";
import { log } from "../log.js";

/**
 * Folders in the library are matched by *name path*, not by id.
 *
 * The second world's "Spells" folder has a different id from the first world's, but it is the
 * same folder to the GM, so "Homebrew Items / Spells" from either world lands in one folder.
 * Folders are created only when a document is actually written into them, so importing a
 * compendium whose content is already in the library leaves no empty folders behind.
 */

function folderParentId(folder) {
  return folder?.folder?.id ?? folder?.folder ?? null;
}

/**
 * Names from the root down to this folder, inclusive.
 * @param {Folder} folder
 * @param {Map<string, Folder>} byId
 */
function pathOf(folder, byId) {
  const names = [];
  const seen = new Set();
  let current = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = byId.get(folderParentId(current));
  }
  return names;
}

/**
 * Resolves (and lazily creates) folders in one library pack.
 * @param {CompendiumCollection} target
 */
export function createFolderResolver(target) {
  const Folder = documentClass("Folder");
  /** "a/b/c" -> folder id, seeded from what the pack already has */
  const known = new Map();
  let created = 0;

  const existing = [...(target.folders ?? [])];
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const folder of existing) {
    const key = pathOf(folder, byId).join("/");
    if (!known.has(key)) known.set(key, folder.id);
  }

  /**
   * @param {string[]} names root-first folder names
   * @returns {Promise<string|null>} folder id, or null for the pack root
   */
  async function resolve(names) {
    if (!names.length || !Folder) return null;
    let parent = null;
    for (let depth = 1; depth <= names.length; depth++) {
      const key = names.slice(0, depth).join("/");
      let id = known.get(key);
      if (!id) {
        try {
          const [folder] = await Folder.createDocuments(
            [{ name: names[depth - 1], type: target.documentName, folder: parent }],
            { pack: target.collection }
          );
          id = folder?.id ?? null;
          if (id) {
            known.set(key, id);
            created += 1;
          }
        } catch (err) {
          log.error(`Unable to create folder "${key}" in ${target.collection}`, err);
          return parent;
        }
      }
      parent = id;
    }
    return parent;
  }

  return {
    resolve,
    get created() {
      return created;
    }
  };
}

/**
 * Root-first folder names for every folder in a source pack, keyed by folder id.
 * @param {CompendiumCollection} source
 * @returns {Map<string, string[]>}
 */
export function sourceFolderPaths(source) {
  const folders = [...(source.folders ?? [])];
  const byId = new Map(folders.map((f) => [f.id, f]));
  return new Map(folders.map((folder) => [folder.id, pathOf(folder, byId)]));
}
