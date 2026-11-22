import { MANAGED_TYPES, MODULE_ID, isPrimaryGM, sharedPackId } from "../constants.js";
import { readMeta } from "../meta.js";
import { acceptCurrentLibrary, checkLibrary, lastHealth } from "../health.js";
import { inspectLeftovers, leftoverPacks, removeLeftovers } from "../packs/leftovers.js";
import { openImport, onImportComplete } from "./import-app.js";
import { confirm, info, t, warn } from "./notify.js";

/**
 * The status page. With one shared library there is nothing to sync, so this only answers
 * "is the library healthy, what is in it, and who uses it" — and offers the import window.
 */

let ManagerApplication = null;
let instance = null;

function defineApplication() {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  return class CompendiumManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "sargas-compendium-manager-app",
      classes: ["sargas-compendium-manager"],
      tag: "div",
      window: {
        title: "SARGAS_COMPENDIUM_MANAGER.App.Title",
        icon: "fa-solid fa-book-atlas",
        resizable: true
      },
      position: { width: 560, height: "auto" },
      actions: {
        import: CompendiumManagerApp.#onImport,
        recheck: CompendiumManagerApp.#onRecheck,
        accept: CompendiumManagerApp.#onAccept,
        openPack: CompendiumManagerApp.#onOpenPack,
        removeLeftovers: CompendiumManagerApp.#onRemoveLeftovers
      }
    };

    static PARTS = {
      main: { template: `modules/${MODULE_ID}/templates/manager.hbs` }
    };

    async _prepareContext(_options) {
      const health = lastHealth() ?? (await checkLibrary());
      const meta = await readMeta();
      const shrunk = new Set(health.shrunk.map((s) => s.collection));

      const rows = MANAGED_TYPES.map((definition) => {
        const collection = sharedPackId(definition.key);
        const pack = game.packs.get(collection);
        return {
          collection,
          label: pack?.title ?? definition.label,
          missing: !pack,
          count: health.counts[collection] ?? 0,
          shrunk: shrunk.has(collection)
        };
      });

      const worlds = Object.entries(meta?.worlds ?? {})
        .map(([id, world]) => ({
          title: world.title ?? id,
          current: id === game.world.id,
          when: world.lastOpenedAt ? new Date(world.lastOpenedAt).toLocaleString() : ""
        }))
        .sort((a, b) => Number(b.current) - Number(a.current));

      // Only inspected when there are any: inspecting reads every entry of each leftover.
      const leftovers = leftoverPacks().length ? await inspectLeftovers() : [];
      const removable = leftovers.filter((row) => row.removable && !row.failed);
      this._removableLeftovers = removable.map((row) => ({ collection: row.collection, label: row.label }));

      return {
        leftovers: leftovers.map((row) => ({
          ...row,
          state: row.failed ? "failed" : row.count === 0 ? "empty" : row.removable ? "copied" : "missing"
        })),
        hasLeftovers: leftovers.length > 0,
        removableCount: removable.length,
        canRemove: removable.length > 0 && isPrimaryGM(),
        leftoversNeedImport: leftovers.some((row) => !row.removable && !row.failed),
        health,
        ok: health.status === "ok",
        missingModule: health.status === "missing-module",
        shrank: health.status === "shrank",
        rows,
        worlds,
        hasWorlds: worlds.length > 0,
        system: meta?.systemId ? `${meta.systemId} ${meta.systemVersion ?? ""}`.trim() : game.system.id
      };
    }

    static #onImport() {
      openImport();
    }

    static async #onRecheck() {
      await checkLibrary();
      this.render();
    }

    static async #onAccept() {
      const approved = await confirm({
        title: t("Health.AcceptTitle"),
        content: `<p>${t("Health.AcceptBody")}</p>`
      });
      if (!approved) return;
      await acceptCurrentLibrary();
      this.render();
    }

    static async #onRemoveLeftovers() {
      const rows = this._removableLeftovers ?? [];
      if (!rows.length) return;
      const list = rows.map((row) => `<li>${foundry.utils.escapeHTML(row.label)}</li>`).join("");
      const approved = await confirm({
        title: t("Leftovers.ConfirmTitle"),
        content: `<p>${t("Leftovers.ConfirmBody", { count: rows.length })}</p><ul>${list}</ul><p>${t("Leftovers.ConfirmPermanent")}</p>`
      });
      if (!approved) return;
      const { removed, kept } = await removeLeftovers(rows.map((row) => row.collection));
      if (removed.length) info("Leftovers.Removed", { count: removed.length });
      if (kept.length) warn("Leftovers.Kept", { count: kept.length });
      this.render();
    }

    static #onOpenPack(_event, target) {
      game.packs.get(target.dataset.collection)?.render(true);
    }
  };
}

/** Open (or focus) the status window. GM only. */
export function openManager() {
  if (!game.user.isGM) return null;
  if (!ManagerApplication) ManagerApplication = defineApplication();
  if (!instance) instance = new ManagerApplication();
  instance.render({ force: true });
  return instance;
}

/** Re-render the status window if it is open. */
export function refreshManager() {
  if (instance?.rendered) instance.render();
}

onImportComplete(async () => {
  await checkLibrary();
  refreshManager();
});

/**
 * Settings-menu entry point. Foundry instantiates and renders the class it is given, so this
 * shim simply forwards to the real window.
 */
export function managerMenuClass() {
  const { ApplicationV2 } = foundry.applications.api;
  return class CompendiumManagerMenu extends ApplicationV2 {
    async render(..._args) {
      openManager();
      return this;
    }
  };
}
