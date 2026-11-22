// Unit tests for the Foundry-independent parts of the import: hashing, link rewriting, matching.
// Run with: node --test tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { contentHash, normalisedName, sourceReference } from "../scripts/import/hash.js";
import { createLinkMap } from "../scripts/import/links.js";
import { MATCH_DEPTH, createMatchIndex, findMatch } from "../scripts/import/match.js";

const ID_A = "aaaaaaaaaaaaaaaa";
const ID_B = "bbbbbbbbbbbbbbbb";
const ID_C = "cccccccccccccccc";

function actor(overrides = {}) {
  return {
    _id: ID_A,
    name: "Goblin Warrior",
    type: "npc",
    folder: "folder0000000001",
    sort: 100,
    ownership: { default: 0 },
    system: { attributes: { hp: { value: 6 } } },
    items: [{ _id: ID_B, name: "Dogslicer", _stats: { createdTime: 1 } }],
    flags: {},
    _stats: { createdTime: 1, modifiedTime: 2, compendiumSource: "Compendium.pf2e.bestiary.Actor.x" },
    ...overrides
  };
}

/* -------------------------------------------- */
/*  contentHash                                  */
/* -------------------------------------------- */

test("contentHash ignores placement, timestamps and v0.1 bookkeeping", () => {
  const moved = actor({
    _id: ID_C,
    folder: null,
    sort: 5,
    ownership: { default: 2 },
    _stats: { createdTime: 99 },
    items: [{ _id: ID_B, name: "Dogslicer", _stats: { createdTime: 42, modifiedTime: 43 } }],
    flags: { "sargas-compendium-manager": { rev: 3, hash: "deadbeef" } }
  });
  assert.equal(contentHash(moved), contentHash(actor()));
});

test("contentHash sees a real content change, including in embedded documents", () => {
  assert.notEqual(contentHash(actor({ system: { attributes: { hp: { value: 7 } } } })), contentHash(actor()));
  assert.notEqual(contentHash(actor({ items: [{ _id: ID_B, name: "Shortsword" }] })), contentHash(actor()));
  assert.notEqual(contentHash(actor({ flags: { other: { x: 1 } } })), contentHash(actor()));
});

test("contentHash is independent of key order and does not modify its input", () => {
  const a = { name: "x", system: { b: 1, a: 2 } };
  const b = { system: { a: 2, b: 1 }, name: "x" };
  assert.equal(contentHash(a), contentHash(b));
  const original = actor();
  const copy = structuredClone(original);
  contentHash(original);
  assert.deepEqual(original, copy);
});

test("sourceReference and normalisedName", () => {
  assert.equal(sourceReference(actor()), "Compendium.pf2e.bestiary.Actor.x");
  assert.equal(sourceReference({ flags: { core: { sourceId: "Compendium.pf2e.y.Item.z" } } }), "Compendium.pf2e.y.Item.z");
  assert.equal(sourceReference({}), null);
  assert.equal(normalisedName("  Goblin   WARRIOR "), "goblin warrior");
});

/* -------------------------------------------- */
/*  Link rewriting                               */
/* -------------------------------------------- */

const LIB = "sargas-compendium-library.cm-items";

function mapWithItem() {
  const links = createLinkMap();
  links.add("world.homebrew", ID_A, { collection: LIB, type: "Item", id: ID_A });
  links.add("world.homebrew", ID_B, { collection: LIB, type: "Item", id: ID_C });
  return links;
}

test("rewrites current-style UUID links to the shared copy", () => {
  const { data, changed } = mapWithItem().rewrite({
    text: `See @UUID[Compendium.world.homebrew.Item.${ID_A}]{Sword} and @UUID[Compendium.world.homebrew.Item.${ID_B}]`
  });
  assert.equal(changed, 2);
  assert.equal(
    data.text,
    `See @UUID[Compendium.${LIB}.Item.${ID_A}]{Sword} and @UUID[Compendium.${LIB}.Item.${ID_C}]`
  );
});

test("rewrites untyped and legacy @Compendium links", () => {
  const { data } = mapWithItem().rewrite({
    a: `@UUID[Compendium.world.homebrew.${ID_A}]`,
    b: `@Compendium[world.homebrew.${ID_A}]{Sword}`
  });
  assert.equal(data.a, `@UUID[Compendium.${LIB}.Item.${ID_A}]`);
  assert.equal(data.b, `@UUID[Compendium.${LIB}.Item.${ID_A}]{Sword}`);
});

test("keeps embedded document paths after the rewritten part", () => {
  const links = createLinkMap();
  links.add("world.lore", ID_A, { collection: "sargas-compendium-library.cm-journals", type: "JournalEntry", id: ID_A });
  const { data } = links.rewrite({ t: `@UUID[Compendium.world.lore.JournalEntry.${ID_A}.JournalEntryPage.${ID_B}]` });
  assert.equal(data.t, `@UUID[Compendium.sargas-compendium-library.cm-journals.JournalEntry.${ID_A}.JournalEntryPage.${ID_B}]`);
});

test("leaves unmapped links, other packs, and prefixes of longer pack names alone", () => {
  const input = {
    unmapped: `@UUID[Compendium.world.homebrew.Item.${"z".repeat(16)}]`,
    otherPack: `@UUID[Compendium.world.other.Item.${ID_A}]`,
    longerName: `@UUID[Compendium.world.homebrew-2.Item.${ID_A}]`,
    world: `@UUID[Item.${ID_A}]`
  };
  const { data, changed } = mapWithItem().rewrite(input);
  assert.equal(changed, 0);
  assert.equal(data, input, "returns the same object when nothing changed");
});

test("an empty link map is a no-op", () => {
  const input = { t: `@UUID[Compendium.world.homebrew.Item.${ID_A}]` };
  assert.equal(createLinkMap().rewrite(input).data, input);
});

/* -------------------------------------------- */
/*  Matching                                     */
/* -------------------------------------------- */

const library = [
  { _id: ID_A, name: "Goblin Warrior", type: "npc", _stats: { compendiumSource: "Compendium.pf2e.bestiary.Actor.x" } },
  { _id: ID_B, name: "Homebrew Ogre", type: "npc" }
];

test("matches by id first", () => {
  const index = createMatchIndex(library);
  const match = findMatch({ _id: ID_A, name: "Renamed", type: "npc" }, index, MATCH_DEPTH.name, "world.x");
  assert.equal(match.via, "id");
  assert.equal(match.target._id, ID_A);
});

test("matches by original compendium entry, then by type and name", () => {
  const index = createMatchIndex(library);
  const bySource = findMatch(
    { _id: ID_C, name: "Other", type: "npc", _stats: { compendiumSource: "Compendium.pf2e.bestiary.Actor.x" } },
    index,
    MATCH_DEPTH.name,
    "world.x"
  );
  assert.equal(bySource.via, "source");
  const byName = findMatch({ _id: ID_C, name: " homebrew  OGRE", type: "npc" }, index, MATCH_DEPTH.name, "world.x");
  assert.equal(byName.via, "name");
  assert.equal(byName.target._id, ID_B);
  assert.equal(findMatch({ _id: ID_C, name: "Homebrew Ogre", type: "character" }, index, MATCH_DEPTH.name, "world.x"), null);
});

test("respects the depth setting", () => {
  const index = createMatchIndex(library);
  const doc = { _id: ID_C, name: "Homebrew Ogre", type: "npc" };
  assert.equal(findMatch(doc, index, MATCH_DEPTH.source, "world.x"), null);
  assert.equal(findMatch(doc, index, MATCH_DEPTH.id, "world.x"), null);
});

test("entries planned from the same compendium never match each other by name", () => {
  const index = createMatchIndex([]);
  index.add({ _id: ID_A, name: "Longsword", type: "weapon" }, "world.items");
  assert.equal(findMatch({ _id: ID_B, name: "Longsword", type: "weapon" }, index, MATCH_DEPTH.name, "world.items"), null);
});

test("entries planned from another selected compendium do match", () => {
  const index = createMatchIndex([]);
  index.add({ _id: ID_A, name: "Longsword", type: "weapon" }, "world.items");
  const match = findMatch({ _id: ID_B, name: "Longsword", type: "weapon" }, index, MATCH_DEPTH.name, "world.more-items");
  assert.equal(match.via, "name");
  assert.equal(match.target.origin, "world.items");
  const sameId = findMatch({ _id: ID_A, name: "x", type: "weapon" }, index, MATCH_DEPTH.id, "world.more-items");
  assert.equal(sameId.via, "id");
});
