import { compendiumCollectionClass, isPrimaryGM } from "../constants.js";
import { SETTINGS, getSetting } from "../settings.js";
import { readMeta, updateMeta } from "../meta.js";
import { libraryCollections } from "./library.js";
import { log } from "../log.js";

/**
 * Pack lock state and ownership live in the world-scoped core setting
 * `compendiumConfiguration`, which is why each world has to be configured separately.
 *
 * This module touches entries only for the library packs — plus, when the GM ticks the option
 * in the import window, the lock of compendiums they just imported from. It writes only when the
 * current value actually differs, and never edits core or system files.
 */

/** Set while this module is configuring packs, so its own writes are not recorded as the GM's. */
let applying = false;

function settingKey() {
  return compendiumCollectionClass()?.CONFIG_SETTING ?? "compendiumConfiguration";
}

function currentConfiguration() {
  try {
    return game.settings.get("core", settingKey()) ?? {};
  } catch (err) {
    log.error("Unable to read the core compendium configuration.", err);
    return {};
  }
}

/**
 * Ensure library packs are unlocked, and apply the ownership recorded by the other world.
 * Idempotent: a second run performs no writes.
 */
export async function applyPackConfiguration() {
  if (!isPrimaryGM()) return;

  const configuration = currentConfiguration();
  const meta = await readMeta();
  const propagateOwnership = getSetting(SETTINGS.syncPackOwnership) === true;
  const recorded = propagateOwnership ? meta?.packOwnership ?? {} : {};

  applying = true;
  try {
    for (const collection of libraryCollections()) {
      const pack = game.packs.get(collection);
      if (!pack) continue;

      const existing = configuration[collection] ?? {};
      const changes = {};

      if (existing.locked !== false) changes.locked = false;

      const desiredOwnership = recorded[collection];
      if (desiredOwnership && !foundry.utils.objectsEqual(existing.ownership ?? {}, desiredOwnership)) {
        changes.ownership = foundry.utils.deepClone(desiredOwnership);
      }

      if (!Object.keys(changes).length) continue;

      try {
        await pack.configure(changes);
        log.debug(`Configured ${collection}`, changes);
      } catch (err) {
        log.error(`Unable to configure pack ${collection}`, err);
      }
    }
  } finally {
    applying = false;
  }
}

/**
 * Record the ownership the GM has set in this world, so the other world can pick it up.
 * Called when the core compendium configuration changes.
 */
export async function captureOwnership() {
  if (applying || !isPrimaryGM()) return;
  if (getSetting(SETTINGS.syncPackOwnership) !== true) return;

  const configuration = currentConfiguration();
  const meta = await readMeta();
  if (!meta) return;
  const recorded = foundry.utils.deepClone(meta.packOwnership ?? {});

  let changed = false;
  for (const collection of libraryCollections()) {
    const ownership = configuration[collection]?.ownership;
    if (!ownership) continue;
    if (!foundry.utils.objectsEqual(recorded[collection] ?? {}, ownership)) {
      recorded[collection] = foundry.utils.deepClone(ownership);
      changed = true;
    }
  }

  if (!changed) return;
  // Pack ownership always lists every role, so merging into the recorded copy loses nothing.
  await updateMeta({ packOwnership: recorded, ownershipWorld: game.world.id, ownershipAt: Date.now() });
  log.debug("Recorded pack ownership for the other world.");
}

/**
 * Lock compendiums the GM has just imported from, so the old copy is not edited by accident.
 * Opt-in from the import window; reversible from the pack's own context menu.
 * @param {string[]} collections
 */
export async function lockPacks(collections) {
  if (!isPrimaryGM()) return 0;
  const managed = new Set(libraryCollections());
  let locked = 0;
  for (const collection of collections) {
    if (managed.has(collection)) continue; // never lock the library itself
    const pack = game.packs.get(collection);
    if (!pack || pack.locked) continue;
    try {
      await pack.configure({ locked: true });
      locked += 1;
    } catch (err) {
      log.error(`Unable to lock ${collection}`, err);
    }
  }
  return locked;
}

/** Hook target: only react to the core compendium configuration setting. */
export function isCompendiumConfigurationSetting(setting) {
  return setting?.key === `core.${settingKey()}`;
}
