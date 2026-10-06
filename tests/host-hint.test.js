"use strict";
// Issue #4 — cross-boundary UI hints (selection label + prompt inside: line).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEditorPage } = require("./helpers/harness");

test("shadow-inner selection label shows the host hint (en)", async () => {
  const h = await createEditorPage();
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);
  assert.equal(h.labels()[0], 'span "read-only note" inside <open-card> (shadow)', h.labels()[0]);
});

test("shadow-inner selection label shows the host hint (zh)", async () => {
  const h = await createEditorPage({ lang: "zh" });
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);
  assert.equal(h.labels()[0], 'span "read-only note" 位于 <open-card> (shadow) 内', h.labels()[0]);
});

test("the host itself gets no hint when selected", async () => {
  const h = await createEditorPage();
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);
  h.key("ArrowUp"); h.key("ArrowUp"); h.key("ArrowUp"); // → host
  assert.equal(h.labels()[0], "<open-card>", h.labels()[0]);
});

test("main-tree elements get no hint", async () => {
  const h = await createEditorPage();
  h.click(h.page.plainBtn);
  assert.equal(h.labels()[0], 'button "Plain button"', h.labels()[0]);
});

test("prompt inside: line carries the shadow host", async () => {
  const h = await createEditorPage();
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);
  h.copyPrompt();
  assert.ok(h.lastPrompt().includes("inside: shadow <open-card>"), h.lastPrompt());
});

test("main-tree prompt keeps the plain inside: behavior", async () => {
  const h = await createEditorPage();
  h.click(h.page.plainBtn);
  h.copyPrompt();
  const inside = (h.lastPrompt().match(/^   inside: (.+)$/m) || [])[1] || "";
  assert.ok(!inside.includes("shadow"), `unexpected shadow hint: ${inside}`);
});

test("hints are per-element and disappear when the element is removed", async () => {
  const h = await createEditorPage();
  const text = h.page.openCard.shadowRoot.querySelector("span.card__text");
  h.click(text);
  h.click(h.page.plainBtn, { shiftKey: true });
  assert.equal(h.labels().length, 2);
  assert.equal(
    h.labels().filter(l => l.includes("(shadow)")).length, 1,
    "only the shadow element's label should carry the hint",
  );

  // Remove the shadow element via its selection tag × button.
  const tagX = Array.from(h.window.document.querySelectorAll(".ai-editor-tag-x"))[0];
  tagX.click();
  const remaining = h.labels();
  assert.equal(remaining.length, 1);
  assert.ok(!remaining[0].includes("(shadow)"), `hint outlived its element: ${remaining[0]}`);
});
