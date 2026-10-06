"use strict";
// Issue #2 — cross-shadow-boundary selector generation.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEditorPage, resolveSegmented, selectorLineFrom } = require("./helpers/harness");

test("shadow-inner element gets a segmented selector that resolves uniquely to it", async () => {
  const h = await createEditorPage();
  const btn = h.page.openCard.shadowRoot.querySelector("button.card__btn");
  h.click(btn);
  h.copyPrompt();

  const selector = selectorLineFrom(h.lastPrompt());
  assert.ok(selector.includes(" >> "), `expected segmented selector, got: ${selector}`);
  const result = resolveSegmented(h.window, selector);
  assert.equal(result.ok, true, `selector did not resolve segment-by-segment: ${selector}`);
  assert.equal(result.el, btn);
});

test("selector segments keep stable classes and drop utility/random classes inside shadow trees", async () => {
  const h = await createEditorPage();
  const title = h.page.openCard.shadowRoot.querySelector("span.card__title");
  h.click(title);
  h.copyPrompt();

  const selector = selectorLineFrom(h.lastPrompt());
  assert.ok(selector.includes("card__title"), `stable class segment missing: ${selector}`);
  assert.ok(!/\.(flex|px-4|rounded-full)\b/.test(selector), `utility class leaked into selector: ${selector}`);
  assert.equal(resolveSegmented(h.window, selector).el, title);
});

test("shadow element with stable attributes prefers them (id / data-testid)", async () => {
  const h = await createEditorPage();
  const input = h.page.loginForm.shadowRoot.querySelector("input");
  h.click(input);
  h.copyPrompt();

  const selector = selectorLineFrom(h.lastPrompt());
  assert.ok(selector.includes('[data-testid="user-input"]'), `data-testid not preferred: ${selector}`);
  assert.ok(selector.includes(" >> "), `expected segmented selector: ${selector}`);
  assert.equal(resolveSegmented(h.window, selector).el, input);
});

test("nested shadow elements resolve across two boundaries", async () => {
  const h = await createEditorPage();
  const badge = h.page.outerPanel.shadowRoot.querySelectorAll("inner-badge")[1].shadowRoot.querySelector(".badge");
  h.click(badge);
  h.copyPrompt();

  const selector = selectorLineFrom(h.lastPrompt());
  assert.equal(selector.split(" >> ").length, 3, `expected two boundaries: ${selector}`);
  const result = resolveSegmented(h.window, selector);
  assert.equal(result.ok, true, `nested selector did not resolve: ${selector}`);
  assert.equal(result.el, badge);
});

test("main-tree selector output has no regression", async () => {
  const h = await createEditorPage();
  h.click(h.page.plainBtn);
  h.copyPrompt();

  const selector = selectorLineFrom(h.lastPrompt());
  assert.equal(selector, "#plain-btn");
  assert.ok(!selector.includes(">>"));
});

test("main-tree element with only utility classes gets a utility-free selector", async () => {
  const h = await createEditorPage();
  const span = h.page.plainSection.querySelector("span");
  h.click(span);
  h.copyPrompt();

  // The span has a locator, so the selector line is (correctly) omitted; the
  // point is that utility classes never surface anywhere in the output.
  const prompt = h.lastPrompt();
  assert.ok(!/\.(flex|px-4|rounded-full)\b/.test(prompt), `utility class leaked:\n${prompt}`);
});

test("locator (role + accessible name) is generated for shadow-inner elements", async () => {
  const h = await createEditorPage();
  h.click(h.page.openCard.shadowRoot.querySelector("button.card__btn"));
  h.copyPrompt();
  assert.ok(h.lastPrompt().includes('locator: button "Confirm"'), h.lastPrompt());

  h.key("Escape");
  h.click(h.page.loginForm.shadowRoot.querySelector("input"));
  h.copyPrompt();
  assert.ok(h.lastPrompt().includes('locator: textbox "Username"'), h.lastPrompt());
});
