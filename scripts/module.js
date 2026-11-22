import { LIBRARY_ID, MODULE_ID, REQUIRED_SYSTEM, isPrimaryGM } from "./constants.js";
import { SETTINGS, getSetting, registerSettings } from "./settings.js";
import {
  applyPackConfiguration,
  captureOwnership,
  isCompendiumConfigurationSetting,
  placeLibraryInFolder
} from "./packs/config.js";
import { leftoverPacks } from "./packs/leftovers.js";
import { ensureMeta, readMeta, recordWorld, updateMeta } from "./meta.js";
import { checkLibrary, recordCounts, watchLibraryCounts } from "./health.js";
import { applyImport, previewImport } from "./import/importer.js";
import { openManager, managerMenuClass, refreshManager } from "./ui/manager-app.js";
import { openImport } from "./ui/import-app.js";
import { maybeShowWelcome } from "./ui/welcome.js";
import { error, info, t, warn } from "./ui/notify.js";
import { log } from "./log.js";

/**
 * Compendium Manager — two pf2e worlds, one compendium library.
 *
 * Both worlds open the same packs (declared by the data-only library module), so there is
 * nothing to sync. This module only handles what Foundry keeps per world: unlocking the packs,
 * carrying pack ownership across, checking the library is intact, and importing existing
 * compendiums. See PLAN-v2.md.
 *
 * It never modifies Foundry core files or the pf2e system: everything happens through
 * documented hooks and public document APIs.
 */

let active = false;

/** The module only runs on pf2e (PLAN.md §2.1). */
function systemSupported() {
  return game.system.id === REQUIRED_SYSTEM;
}

function registerHandlebarsHelpers() {
  // Own helper rather than relying on a core one that may not exist in every version.
  Handlebars.registerHelper("scmEq", (a, b) => a === b);
}

/** @returns {Promise<boolean>} false when the library belongs to another system */
async function checkSystem() {
  const meta = await readMeta();
  if (!meta) return true;

  if (meta.systemId && meta.systemId !== game.system.id) {
    error("Errors.SystemMismatch", { recorded: meta.systemId, current: game.system.id });
    return false;
  }
  if (meta.systemVersion && meta.systemVersion !== game.system.version) {
    warn("Errors.VersionDrift", { recorded: meta.systemVersion, current: game.system.version });
    await updateMeta({ systemVersion: game.system.version, foundryVersion: game.version });
  }
  return true;
}

Hooks.once("init", () => {
  registerSettings();
  registerHandlebarsHelpers();

  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "SARGAS_COMPENDIUM_MANAGER.Settings.Manager.Name",
    label: "SARGAS_COMPENDIUM_MANAGER.Settings.Manager.Label",
    hint: "SARGAS_COMPENDIUM_MANAGER.Settings.Manager.Hint",
    icon: "fa-solid fa-book-atlas",
    type: managerMenuClass(),
    restricted: true
  });

  log.debug("Initialised.");
});

Hooks.once("setup", () => {
  if (!systemSupported()) log.warn(`Inactive: this module requires the ${REQUIRED_SYSTEM} system.`);
});

Hooks.once("ready", async () => {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      open: openManager,
      openImport,
      previewImport,
      applyImport,
      checkLibrary,
      isActive: () => active
    };
  }

  if (!systemSupported()) {
    if (game.user.isGM) error("Errors.WrongSystem", { system: REQUIRED_SYSTEM });
    return;
  }

  // Players need nothing from this module: they see whatever pack ownership allows.
  active = true;
  if (!game.user.isGM) return;

  try {
    const health = await checkLibrary();

    if (health.status === "missing-module") {
      error("Errors.LibraryMissing", { id: LIBRARY_ID });
      return;
    }
    if (health.missingPacks.length) warn("Errors.MissingPacks", { packs: health.missingPacks.join(", ") });

    // Only one GM client writes anything.
    if (!isPrimaryGM()) return;

    if (health.status === "shrank") {
      // Write nothing to the library until the GM has looked (status page explains what to do).
      error("Errors.LibraryShrank");
      openManager();
    } else {
      await ensureMeta();
      if (!(await checkSystem())) return;
      await recordWorld();
      await recordCounts(health.counts);
    }

    await applyPackConfiguration();
    try {
      await placeLibraryInFolder();
    } catch (err) {
      log.error("Unable to put the shared compendiums in their sidebar folder.", err);
    }
    // Registered after configuring, so the module's own writes are not recorded as the GM's.
    Hooks.on("updateSetting", (setting) => {
      if (!isCompendiumConfigurationSetting(setting)) return;
      captureOwnership().catch((err) => log.error("Unable to record pack ownership.", err));
    });
    watchLibraryCounts();

    refreshManager();
    log.info(`Active in world "${game.world.id}".`);
    if (getSetting(SETTINGS.debug)) info("App.Ready");

    const leftovers = leftoverPacks().length;
    if (leftovers) info("Leftovers.Notice", { count: leftovers });

    if (health.status === "ok") await maybeShowWelcome(health.counts);
  } catch (err) {
    log.error("Startup failed.", err);
    error("Errors.StartupFailed");
  }
});

/** Add a manager button to the compendium sidebar, failing quietly if the markup changes. */
Hooks.on("renderCompendiumDirectory", (_app, element) => {
  if (!game.user.isGM || !active) return;
  try {
    const root = element instanceof HTMLElement ? element : element?.[0];
    // Prefer the row holding "Create Compendium" / "Create Folder"; the outer header stacks its
    // children vertically, where a full-width button would stretch to the header's height.
    const header = root?.querySelector(".header-actions") ?? root?.querySelector(".directory-header");
    if (!header || root.querySelector(".scm-open-manager")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("scm-open-manager");
    button.innerHTML = `<i class="fa-solid fa-book-atlas"></i> ${t("App.Button")}`;
    button.addEventListener("click", () => openManager());
    header.append(button);
  } catch (err) {
    log.debug("Could not add the sidebar button.", err);
  }
});
