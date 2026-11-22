import { MANAGED_TYPES, MODULE_ID, isPrimaryGM } from "../constants.js";
import {
  applyImport,
  countWrites,
  importableSources,
  plannedAction,
  previewImport,
  resolutionKey
} from "../import/importer.js";
import { MATCH_DEPTH } from "../import/match.js";
import { lastHealth } from "../health.js";
import { confirm, info, t, warn } from "./notify.js";
import { log } from "../log.js";

/**
 * "Bring in compendiums": one window for every compendium at once.
 *
 *   pick -> preview (writes nothing) -> confirm -> working -> done
 */

let ImportApplication = null;
let instance = null;
const listeners = new Set();

/** Let other windows (the status page) refresh after an import. */
export function onImportComplete(fn) {
  listeners.add(fn);
}

function packageLabel(pack) {
  const type = pack.metadata?.packageType ?? pack.metadata?.package;
  if (type === "world") return t("Import.Origin.World");
  const name = pack.metadata?.packageName ?? pack.metadata?.package ?? "";
  const title = game.modules.get(name)?.title ?? (game.system.id === name ? game.system.title : name);
  return title || name;
}

function defineApplication() {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  return class ImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
    #step = "pick";
    #selected = new Set();
    #includeAll = false;
    #depth = "name";
    #rewriteLinks = true;
    #lockSources = false;
    #report = null;
    #resolutions = {};
    #result = null;
    #busy = false;

    static DEFAULT_OPTIONS = {
      id: "sargas-compendium-manager-import",
      classes: ["sargas-compendium-manager", "sargas-compendium-manager-import"],
      tag: "div",
      window: {
        title: "SARGAS_COMPENDIUM_MANAGER.Import.Title",
        icon: "fa-solid fa-file-import",
        resizable: true
      },
      position: { width: 720, height: 640 },
      actions: {
        preview: ImportApp.#onPreview,
        back: ImportApp.#onBack,
        setAll: ImportApp.#onSetAll,
        apply: ImportApp.#onApply,
        again: ImportApp.#onAgain,
        close: ImportApp.#onClose
      }
    };

    static PARTS = {
      main: { template: `modules/${MODULE_ID}/templates/import.hbs` }
    };

    async _prepareContext(_options) {
      const context = {
        step: this.#step,
        isPick: this.#step === "pick",
        isPreview: this.#step === "preview",
        isWorking: this.#step === "working",
        isDone: this.#step === "done",
        busy: this.#busy
      };

      if (this.#step === "pick") {
        const sources = importableSources({ includeAll: this.#includeAll });
        context.groups = MANAGED_TYPES.map((definition) => ({
          label: definition.label,
          packs: sources
            .filter((pack) => pack.documentName === definition.type)
            .map((pack) => ({
              collection: pack.collection,
              title: pack.title,
              origin: packageLabel(pack),
              count: pack.index?.size ?? 0,
              checked: this.#selected.has(pack.collection)
            }))
        })).filter((group) => group.packs.length);
        context.hasSources = context.groups.length > 0;
        context.selectedCount = this.#selected.size;
        context.includeAll = this.#includeAll;
        context.rewriteLinks = this.#rewriteLinks;
        context.lockSources = this.#lockSources;
        context.depths = Object.keys(MATCH_DEPTH).map((value) => ({
          value,
          label: t(`Import.Depth.${value}`),
          selected: value === this.#depth
        }));
      }

      if (this.#step === "preview" && this.#report) {
        const report = this.#report;
        context.totals = report.totals;
        context.writes = countWrites(report, this.#resolutions);
        context.packs = report.packs.map((pack) => {
          const decisions = pack.entries
            .filter((entry) => entry.status === "decision")
            .map((entry) => {
              const key = resolutionKey(pack.source, entry.id);
              return {
                key,
                name: entry.name,
                targetName: entry.targetName,
                via: t(`Import.Via.${entry.via}`),
                resolution: this.#resolutions[key] ?? "library"
              };
            });
          return {
            sourceLabel: pack.sourceLabel,
            targetLabel: pack.targetLabel,
            counts: pack.counts,
            decisions,
            hasDecisions: decisions.length > 0,
            open: report.packs.length === 1
          };
        });
        context.hasDecisions = report.totals.decision > 0;
      }

      if (this.#step === "done") context.result = this.#result;
      return context;
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.element;

      for (const box of root.querySelectorAll("[data-source]")) {
        box.addEventListener("change", (event) => {
          const { source } = event.target.dataset;
          if (event.target.checked) this.#selected.add(source);
          else this.#selected.delete(source);
          const counter = root.querySelector("[data-selected-count]");
          if (counter) counter.textContent = String(this.#selected.size);
          const button = root.querySelector("[data-action='preview']");
          if (button) button.disabled = this.#selected.size === 0;
        });
      }

      root.querySelector("[data-include-all]")?.addEventListener("change", (event) => {
        this.#includeAll = event.target.checked;
        // Drop selections that are no longer listed, so the count matches what is visible.
        const visible = new Set(importableSources({ includeAll: this.#includeAll }).map((p) => p.collection));
        for (const collection of [...this.#selected]) if (!visible.has(collection)) this.#selected.delete(collection);
        this.render();
      });
      root.querySelector("[data-depth]")?.addEventListener("change", (event) => {
        this.#depth = event.target.value;
      });
      root.querySelector("[data-rewrite-links]")?.addEventListener("change", (event) => {
        this.#rewriteLinks = event.target.checked;
      });
      root.querySelector("[data-lock-sources]")?.addEventListener("change", (event) => {
        this.#lockSources = event.target.checked;
      });

      for (const select of root.querySelectorAll("[data-resolution]")) {
        select.addEventListener("change", (event) => {
          this.#resolutions[event.target.dataset.key] = event.target.value;
          const writes = root.querySelector("[data-writes]");
          if (writes) writes.textContent = String(countWrites(this.#report, this.#resolutions));
        });
      }
    }

    #setProgress(done, total) {
      const bar = this.element?.querySelector("[data-progress]");
      const label = this.element?.querySelector("[data-progress-label]");
      if (bar) {
        bar.max = Math.max(total, 1);
        bar.value = done;
      }
      if (label) label.textContent = t("Import.Progress", { done, total });
    }

    static async #onPreview() {
      if (this.#busy || !this.#selected.size) return;
      this.#busy = true;
      this.render();
      try {
        // Keep the order the GM sees: grouped by type, then as listed.
        const typeOrder = MANAGED_TYPES.map((d) => d.type);
        const collections = importableSources({ includeAll: this.#includeAll })
          .filter((pack) => this.#selected.has(pack.collection))
          .sort((a, b) => typeOrder.indexOf(a.documentName) - typeOrder.indexOf(b.documentName))
          .map((pack) => pack.collection);
        this.#report = await previewImport(collections, {
          depth: MATCH_DEPTH[this.#depth] ?? MATCH_DEPTH.name,
          rewriteLinks: this.#rewriteLinks
        });
        this.#resolutions = {};
        this.#step = "preview";
      } catch (err) {
        log.error("Import preview failed.", err);
        warn("Import.PreviewFailed");
      } finally {
        this.#busy = false;
      }
      this.render();
    }

    static #onBack() {
      this.#step = "pick";
      this.#report = null;
      this.#resolutions = {};
      this.render();
    }

    static #onSetAll(_event, target) {
      if (!this.#report) return;
      const value = target.dataset.value;
      for (const pack of this.#report.packs) {
        for (const entry of pack.entries) {
          if (entry.status === "decision") this.#resolutions[resolutionKey(pack.source, entry.id)] = value;
        }
      }
      this.render();
    }

    static async #onApply() {
      if (!this.#report || this.#busy) return;
      const report = this.#report;
      const writes = countWrites(report, this.#resolutions);
      if (!writes) {
        info("Import.NothingToDo");
        return;
      }

      let replaced = 0;
      for (const pack of report.packs) {
        for (const entry of pack.entries) {
          if (plannedAction(pack, entry, this.#resolutions) === "world") replaced += 1;
        }
      }

      const approved = await confirm({
        title: t("Import.ConfirmTitle"),
        content:
          `<p>${t("Import.ConfirmBody", { count: writes })}</p>` +
          (replaced ? `<p><strong>${t("Import.ConfirmReplace", { count: replaced })}</strong></p>` : "") +
          `<p>${t("Import.ConfirmNoDelete")}</p>`
      });
      if (!approved) return;

      this.#busy = true;
      this.#step = "working";
      await this.render();
      try {
        this.#result = await applyImport(report, this.#resolutions, {
          lockSources: this.#lockSources,
          onProgress: (done, total) => this.#setProgress(done, total)
        });
        if (this.#result.failed) warn("Import.SomeFailed", { count: this.#result.failed });
      } catch (err) {
        log.error("Import failed.", err);
        warn("Import.Failed");
        this.#result = null;
      } finally {
        this.#busy = false;
      }
      this.#step = this.#result ? "done" : "preview";
      this.render();
      for (const fn of listeners) {
        try {
          fn();
        } catch (err) {
          log.debug("Import listener failed.", err);
        }
      }
    }

    static #onAgain() {
      this.#step = "pick";
      this.#selected.clear();
      this.#report = null;
      this.#resolutions = {};
      this.#result = null;
      this.render();
    }

    static #onClose() {
      this.close();
    }
  };
}

/** Open the import window. GM only. */
export function openImport() {
  if (!isPrimaryGM()) {
    if (game.user.isGM) warn("Errors.NotPrimaryGM");
    return null;
  }
  if (lastHealth()?.status !== "ok") {
    warn("Import.LibraryUnhealthy");
    return null;
  }
  if (!ImportApplication) ImportApplication = defineApplication();
  if (!instance) instance = new ImportApplication();
  instance.render({ force: true });
  return instance;
}
