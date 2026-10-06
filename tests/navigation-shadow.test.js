"use strict";
// Issue #3 — marquee select and arrow navigation across shadow boundaries.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEditorPage } = require("./helpers/harness");

test("marquee over a shadow component adds meaningful shadow-inner elements", async () => {
  const h = await createEditorPage();
  h.marquee(h.page.openCard);

  const labels = h.labels().join("\n");
  assert.ok(labels.includes("Card title"), `title not selected:\n${labels}`);
  assert.ok(labels.includes("Confirm"), `button not selected:\n${labels}`);
  assert.ok(labels.includes("read-only note"), `text span not selected:\n${labels}`);
});

test("marquee never selects inside a closed shadow root", async () => {
  const h = await createEditorPage();
  h.marquee(h.page.closedCard);

  const labels = h.labels().join("\n");
  assert.ok(!labels.includes("hidden button"), `closed shadow content leaked:\n${labels}`);
  assert.ok(!labels.includes("secret card"), `closed shadow content leaked:\n${labels}`);
});

test("↑ climbs the shadow chain to the host, then exits the shadow tree", async () => {
  const h = await createEditorPage();
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);

  h.key("ArrowUp");
  assert.ok(h.labels()[0].startsWith('div "Confirm read-only note"'), h.labels()[0]); // .card__row
  h.key("ArrowUp");
  assert.ok(h.labels()[0].startsWith('div "Card title Confirm read-only note"'), h.labels()[0]); // .card
  h.key("ArrowUp");
  assert.equal(h.labels()[0], "<open-card>", `expected host, got: ${h.labels()[0]}`);
  h.key("ArrowUp");
  assert.ok(h.labels()[0].startsWith(".demo"), `expected to exit shadow tree to the main tree, got: ${h.labels()[0]}`);
});

test("↓ from the host descends into the open shadow root", async () => {
  const h = await createEditorPage();
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);
  h.key("ArrowUp"); h.key("ArrowUp"); h.key("ArrowUp"); // → host
  assert.equal(h.labels()[0], "<open-card>", h.labels()[0]);

  h.key("ArrowDown");
  assert.ok(h.labels()[0].startsWith('div "Card title Confirm read-only note"'), `expected shadow child .card, got: ${h.labels()[0]}`);
});

test("↓ on a leaf element is a no-op", async () => {
  const h = await createEditorPage();
  const title = h.page.openCard.shadowRoot.querySelector("span.card__title");
  h.click(title);
  h.key("ArrowDown");
  assert.ok(h.labels()[0].includes("Card title"), h.labels()[0]);
});

test("←/→ move among visible meaningful siblings inside the shadow tree", async () => {
  const h = await createEditorPage();
  const disabled = h.page.toolBar.shadowRoot.querySelectorAll("button")[1];
  h.click(disabled);
  assert.ok(h.labels()[0].includes("Disabled"), h.labels()[0]);

  h.key("ArrowLeft");
  assert.ok(h.labels()[0].includes("Action one"), `← failed: ${h.labels()[0]}`);
  h.key("ArrowRight"); h.key("ArrowRight");
  assert.ok(h.labels()[0].includes("Delete"), `→ failed: ${h.labels()[0]}`);
});

test("↑ from a nested badge crosses two shadow boundaries", async () => {
  const h = await createEditorPage();
  const badge = h.page.outerPanel.shadowRoot.querySelectorAll("inner-badge")[1].shadowRoot.querySelector(".badge");
  h.click(badge);

  h.key("ArrowUp");
  assert.equal(h.labels()[0], "<inner-badge> inside <outer-panel> (shadow)", h.labels()[0]);
  h.key("ArrowUp");
  assert.ok(h.labels()[0].includes("outer panel hint"), `expected div.panel, got: ${h.labels()[0]}`);
  h.key("ArrowUp");
  assert.equal(h.labels()[0], "<outer-panel>", h.labels()[0]);
});

test("mixed selection: ⌘Z undoes and Esc clears across trees", async () => {
  const h = await createEditorPage();
  const shadowBtn = h.page.openCard.shadowRoot.querySelector("button.card__btn");
  h.click(shadowBtn);
  h.click(h.page.plainBtn, { shiftKey: true });
  assert.equal(h.labels().length, 2, "shift-click should add a second element");

  h.key("z", { metaKey: true });
  assert.equal(h.labels().length, 1, "⌘Z should undo the last add");
  assert.ok(h.labels()[0].includes("Confirm"), h.labels()[0]);

  h.key("Escape");
  assert.equal(h.labels().length, 0, "Esc should clear the selection");
});
