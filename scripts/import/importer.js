import { META_DOC_ID, definitionForType, documentClass, isPrimaryGM } from "../constants.js";
import { getSharedPack, libraryCollections } from "../packs/library.js";
import { lockPacks } from "../packs/config.js";
import { recordCounts } from "../health.js";
import { contentHash, sourceReference } from "./hash.js";
import { createLinkMap } from "./links.js";
import { MATCH_DEPTH, MATCH_FIELDS, createMatchIndex, findMatch } from "./match.js";
import { createFolderResolver, sourceFolderPaths } from "./folders.js";
import { log } from "../log.js";

/**
 * Bringing existing compendiums into the shared library.
 *
 * Rules carried over from v0.1, unchanged:
 *  - a preview always comes first and writes nothing;
 *  - nothing is ever deleted from either side;
 *  - running it again is harmless: what was imported shows as "already in the library".
 *
 * Resolutions for entries that need a decision:
 *   "library" keep the library version (default, writes nothing)
 *   "world"   replace the library version with this world's
 *   "both"    keep both; this world's becomes a separate entry
 */

const CHUNK = 50;

/** @param {string} source @param {string} id */
export function resolutionKey(source, id) {
  return `${source}::${id}`;
}

/**
 * Compendiums that can be imported: anything holding a shared document type that is not part
 * of the library itself. World compendiums by default; module and system ones on request.
 * @param {{includeAll?: boolean}} [options]
 */
export function importableSources({ includeAll = false } = {}) {
  const library = new Set(libraryCollections());
  return game.packs.filter((pack) => {
    if (library.has(pack.collection)) return false;
    if (!definitionForType(pack.documentName)) return false;
    if (includeAll) return true;
    return (pack.metadata?.packageType ?? pack.metadata?.package) === "world";
  });
}

/** Load documents by id in chunks, without loading the whole pack. */
async function documentsById(pack, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    let documents;
    try {
      documents = await pack.getDocuments({ _id__in: chunk });
    } catch (err) {
      log.debug(`Batched read failed for ${pack.collection}; reading one by one.`, err);
      documents = [];
      for (const id of chunk) {
        const document = await pack.getDocument(id);
        if (document) documents.push(document);
      }
    }
    for (const document of documents) out.set(document.id, document);
  }
  return out;
}

/**
 * Compare compendiums with the library. Writes nothing.
 *
 * @param {string[]} collections compendiums to import, in order
 * @param {{depth?: number, rewriteLinks?: boolean}} [options]
 * @returns {Promise<object>} report
 */
export async function previewImport(collections, { depth = MATCH_DEPTH.name, rewriteLinks = true } = {}) {
  const randomID = foundry.utils.randomID;
  const links = createLinkMap();
  /** target collection -> { pack, index } */
  const targets = new Map();
  const packs = [];
  const loaded = [];

  // Pass 1: find every document's counterpart and build the link map.
  for (const collection of collections) {
    const source = game.packs.get(collection);
    const definition = source ? definitionForType(source.documentName) : null;
    const target = definition ? getSharedPack(definition) : null;
    if (!source || !target) continue;

    if (!targets.has(target.collection)) {
      const index = await target.getIndex({ fields: MATCH_FIELDS });
      const entries = [...index].filter((entry) => entry._id !== META_DOC_ID);
      targets.set(target.collection, { pack: target, index: createMatchIndex(entries) });
    }
    const { index } = targets.get(target.collection);

    const documents = await source.getDocuments();
    const entries = [];
    for (const document of documents) {
      const data = document.toObject();
      const match = findMatch(data, index, depth, source.collection);
      const entry = {
        id: data._id,
        name: data.name ?? data._id,
        status: match ? "pending" : "new",
        via: match?.via ?? null,
        targetId: match?.target._id ?? null,
        targetName: match?.target.name ?? null,
        targetPlanned: match ? match.target.origin !== null : false,
        // Pre-chosen id for "keep both", so links can be pointed at it before anything is written.
        altId: match ? randomID() : null
      };
      if (!match) {
        index.add(
          { _id: data._id, name: data.name, type: data.type, _stats: { compendiumSource: sourceReference(data) } },
          source.collection
        );
      }
      links.add(source.collection, data._id, {
        collection: target.collection,
        type: source.documentName,
        id: entry.targetId ?? data._id
      });
      entries.push(entry);
      loaded.push({ target: target.collection, entry, data });
    }

    packs.push({
      source: source.collection,
      sourceLabel: source.title ?? source.collection,
      target: target.collection,
      targetLabel: target.title ?? target.collection,
      documentType: source.documentName,
      folderName: source.title ?? source.metadata?.name ?? source.collection,
      entries
    });
  }

  const prepared = (data) => (rewriteLinks ? links.rewrite(data).data : data);

  // Pass 2: matched documents are identical, or need a decision.
  const planned = new Map();
  for (const { target, entry, data } of loaded) {
    if (entry.status === "new") planned.set(`${target}::${entry.id}`, prepared(data));
  }

  const byTarget = new Map();
  for (const item of loaded) {
    if (item.entry.status !== "pending" || item.entry.targetPlanned) continue;
    if (!byTarget.has(item.target)) byTarget.set(item.target, new Set());
    byTarget.get(item.target).add(item.entry.targetId);
  }
  const libraryData = new Map();
  for (const [collection, ids] of byTarget) {
    const documents = await documentsById(targets.get(collection).pack, [...ids]);
    for (const [id, document] of documents) libraryData.set(`${collection}::${id}`, document.toObject());
  }

  for (const { target, entry, data } of loaded) {
    if (entry.status !== "pending") continue;
    const key = `${target}::${entry.targetId}`;
    const counterpart = entry.targetPlanned ? planned.get(key) : libraryData.get(key);
    const same = counterpart && contentHash(prepared(data)) === contentHash(counterpart);
    entry.status = same ? "identical" : "decision";
  }

  const totals = { new: 0, identical: 0, decision: 0, total: 0 };
  for (const pack of packs) {
    pack.counts = { new: 0, identical: 0, decision: 0, total: pack.entries.length };
    for (const entry of pack.entries) {
      pack.counts[entry.status] += 1;
      totals[entry.status] += 1;
    }
    totals.total += pack.entries.length;
  }

  return { createdAt: Date.now(), depth, rewriteLinks, packs, totals };
}

/**
 * What will happen to one entry.
 * @returns {"add"|"skip"|"world"|"both"}
 */
export function plannedAction(pack, entry, resolutions = {}) {
  if (entry.status === "new") return "add";
  if (entry.status === "identical") return "skip";
  const choice = resolutions[resolutionKey(pack.source, entry.id)] ?? "library";
  if (choice === "world") return "world";
  if (choice === "both") return "both";
  return "skip";
}

/** How many documents an apply would write. */
export function countWrites(report, resolutions = {}) {
  let writes = 0;
  for (const pack of report.packs) {
    for (const entry of pack.entries) if (plannedAction(pack, entry, resolutions) !== "skip") writes += 1;
  }
  return writes;
}

/**
 * Write a reviewed preview into the library.
 *
 * @param {object} report result of `previewImport`
 * @param {Record<string, string>} resolutions resolutionKey -> "library" | "world" | "both"
 * @param {{lockSources?: boolean, onProgress?: (done: number, total: number) => void}} [options]
 */
export async function applyImport(report, resolutions = {}, { lockSources = false, onProgress } = {}) {
  const totals = { added: 0, replaced: 0, keptBoth: 0, skipped: 0, failed: 0, folders: 0, locked: 0 };
  if (!isPrimaryGM()) return totals;

  const worldTitle = game.world.title ?? game.world.id;
  const links = createLinkMap();
  for (const pack of report.packs) {
    for (const entry of pack.entries) {
      const action = plannedAction(pack, entry, resolutions);
      const id = action === "add" ? entry.id : action === "both" ? entry.altId : entry.targetId;
      links.add(pack.source, entry.id, { collection: pack.target, type: pack.documentType, id });
    }
  }

  const total = countWrites(report, resolutions);
  let done = 0;
  const progress = () => onProgress?.(done, total);
  progress();

  const resolvers = new Map();
  const resolverFor = (target) => {
    if (!resolvers.has(target.collection)) resolvers.set(target.collection, createFolderResolver(target));
    return resolvers.get(target.collection);
  };

  for (const pack of report.packs) {
    const source = game.packs.get(pack.source);
    const target = game.packs.get(pack.target);
    const DocumentClass = documentClass(pack.documentType);
    if (!source || !target || !DocumentClass) {
      totals.failed += pack.entries.filter((e) => plannedAction(pack, e, resolutions) !== "skip").length;
      continue;
    }

    const actions = new Map(pack.entries.map((entry) => [entry.id, plannedAction(pack, entry, resolutions)]));
    totals.skipped += [...actions.values()].filter((a) => a === "skip").length;

    const writeIds = pack.entries.filter((e) => actions.get(e.id) !== "skip").map((e) => e.id);
    if (!writeIds.length) continue;

    const sourceDocs = await documentsById(source, writeIds);
    const replaceTargets = pack.entries.filter((e) => actions.get(e.id) === "world").map((e) => e.targetId);
    const targetDocs = replaceTargets.length ? await documentsById(target, replaceTargets) : new Map();
    const folderPaths = sourceFolderPaths(source);
    const resolver = resolverFor(target);

    const creates = [];
    const updates = [];
    for (const entry of pack.entries) {
      const action = actions.get(entry.id);
      if (action === "skip") continue;
      const document = sourceDocs.get(entry.id);
      if (!document) {
        totals.failed += 1;
        continue;
      }
      let data = document.toObject();
      if (report.rewriteLinks) data = links.rewrite(data).data;

      if (action === "world") {
        const existing = targetDocs.get(entry.targetId);
        data._id = entry.targetId;
        // Keep the library's organisation; only the content is replaced.
        data.folder = existing?.folder?.id ?? existing?.folder ?? null;
        data.sort = existing?.sort ?? data.sort ?? 0;
        updates.push({ data, kind: "replaced" });
        continue;
      }

      const path = [pack.folderName, ...(folderPaths.get(data.folder) ?? [])];
      data.folder = await resolver.resolve(path);
      if (action === "both") {
        data._id = entry.altId;
        data.name = `${data.name} (${worldTitle})`;
      }
      creates.push({ data, kind: action === "both" ? "keptBoth" : "added" });
    }

    for (let i = 0; i < creates.length; i += CHUNK) {
      const chunk = creates.slice(i, i + CHUNK);
      try {
        await DocumentClass.createDocuments(
          chunk.map((c) => c.data),
          { pack: target.collection, keepId: true }
        );
        for (const c of chunk) totals[c.kind] += 1;
      } catch (err) {
        log.error(`Import into ${target.collection} failed for ${chunk.length} document(s).`, err);
        totals.failed += chunk.length;
      }
      done += chunk.length;
      progress();
    }

    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      try {
        await DocumentClass.updateDocuments(
          chunk.map((u) => u.data),
          { pack: target.collection, diff: false, recursive: false }
        );
        for (const u of chunk) totals[u.kind] += 1;
      } catch (err) {
        log.error(`Replacing documents in ${target.collection} failed for ${chunk.length} document(s).`, err);
        totals.failed += chunk.length;
      }
      done += chunk.length;
      progress();
    }
  }

  for (const resolver of resolvers.values()) totals.folders += resolver.created;
  if (lockSources) totals.locked = await lockPacks(report.packs.map((p) => p.source));
  await recordCounts();
  return totals;
}
