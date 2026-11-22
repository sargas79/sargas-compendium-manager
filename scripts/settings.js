import { MODULE_ID } from "./constants.js";

export const SETTINGS = {
  syncPackOwnership: "syncPackOwnership",
  debug: "debug",
  // Internal, world-scoped state. Never shown in the configuration sheet.
  recordedCounts: "recordedCounts",
  welcomeShown: "welcomeShown",
  libraryFolderPlaced: "libraryFolderPlaced"
};

export function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);

  register(SETTINGS.syncPackOwnership, {
    name: "SARGAS_COMPENDIUM_MANAGER.Settings.SyncPackOwnership.Name",
    hint: "SARGAS_COMPENDIUM_MANAGER.Settings.SyncPackOwnership.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.debug, {
    name: "SARGAS_COMPENDIUM_MANAGER.Settings.Debug.Name",
    hint: "SARGAS_COMPENDIUM_MANAGER.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  /**
   * What this world last saw in the library: `{ counts: {collection: n}, hadMeta, at }`.
   * World-scoped on purpose — it must survive the library being emptied, so it cannot live in it.
   */
  register(SETTINGS.recordedCounts, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  register(SETTINGS.welcomeShown, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  /** Set once the shared compendiums have been put in their sidebar folder in this world. */
  register(SETTINGS.libraryFolderPlaced, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/** @param {string} key */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/** @param {string} key */
export function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}
