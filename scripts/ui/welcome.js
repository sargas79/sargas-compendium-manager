import { definitionForShared } from "../constants.js";
import { SETTINGS, getSetting, setSetting } from "../settings.js";
import { readMeta } from "../meta.js";
import { importableSources } from "../import/importer.js";
import { openImport } from "./import-app.js";
import { t } from "./notify.js";
import { log } from "../log.js";

/**
 * Shown once per world, the first time a GM loads it with the module active.
 * Says what is already in the library and offers to bring existing compendiums in.
 */

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

/**
 * @param {Record<string, number|null>} counts library counts from the health check
 */
export async function maybeShowWelcome(counts) {
  if (getSetting(SETTINGS.welcomeShown) === true) return;
  // Mark first: a reload while the dialog is open should not show it again.
  await setSetting(SETTINGS.welcomeShown, true);

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return;

  const meta = await readMeta();
  const others = Object.entries(meta?.worlds ?? {})
    .filter(([id]) => id !== game.world.id)
    .map(([, world]) => escape(world.title));

  const filled = Object.entries(counts ?? {})
    .filter(([, n]) => n > 0)
    .map(([collection, n]) => `<li>${n} ${escape(definitionForShared(collection)?.label ?? collection)}</li>`);

  let body;
  if (filled.length) {
    const from = others.length ? t("Welcome.FromWorlds", { worlds: others.join(", ") }) : "";
    body = `<p>${t("Welcome.HasContent")} ${from}</p><ul>${filled.join("")}</ul>`;
  } else {
    body = `<p>${t("Welcome.Empty")}</p>`;
  }
  body += `<p>${t("Welcome.HowItWorks")}</p>`;

  const canImport = importableSources().length > 0;
  if (canImport) body += `<p>${t("Welcome.Offer")}</p>`;

  const buttons = [];
  if (canImport) {
    buttons.push({
      action: "import",
      label: t("Welcome.Import"),
      icon: "fa-solid fa-file-import",
      default: true
    });
  }
  buttons.push({ action: "later", label: canImport ? t("Welcome.Later") : t("Welcome.Ok"), default: !canImport });

  try {
    const choice = await DialogV2.wait({
      window: { title: t("Welcome.Title"), icon: "fa-solid fa-book-atlas" },
      content: body,
      buttons,
      rejectClose: false
    });
    if (choice === "import") openImport();
  } catch (err) {
    log.debug("Welcome dialog closed.", err);
  }
}
