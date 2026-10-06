"use strict";
// Test harness: loads the REAL assembled editor payload (dist/assets/editor.js,
// rebuilt by `npm test` before the runner starts) into jsdom and drives it the
// way a user would — synthetic pointer/keyboard events on real DOM nodes.
//
// jsdom has no layout engine, so getBoundingClientRect is stubbed with a
// WeakMap registry (harness.layout). The editor's overlay/marquee divs are
// positioned via inline styles only, so the marquee's rect is derived from its
// own style — that keeps drag-selection geometry honest without a layout pass.
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const PAYLOAD_PATH = path.join(__dirname, "..", "..", "dist", "assets", "editor.js");

const EMPTY_RECT = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };

function rectFromBox([left, top, right, bottom]) {
  return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top };
}

function installGeometryStub(window, rects) {
  window.Element.prototype.getBoundingClientRect = function () {
    if (this.classList && this.classList.contains("ai-editor-marquee")) {
      // The editor drives the marquee purely through inline styles; jsdom has
      // no layout, so read the drag rect back out of them.
      const s = this.style;
      const left = parseFloat(s.left) || 0;
      const top = parseFloat(s.top) || 0;
      const width = parseFloat(s.width) || 0;
      const height = parseFloat(s.height) || 0;
      return rectFromBox([left, top, left + width, top + height]);
    }
    const box = rects.get(this);
    return box ? rectFromBox(box) : { ...EMPTY_RECT };
  };
}

// Custom elements mirroring fixtures/shadow-dom.html: open / nested-open /
// disabled-inside-open / form-inside-open / closed, plus main-tree baselines.
function defineTestElements(window) {
  const { document, HTMLElement, customElements } = window;

  class OpenCard extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" }).innerHTML = `
        <div class="card">
          <span class="card__title">Card title</span>
          <div class="card__row">
            <button class="card__btn" type="button">Confirm</button>
            <span class="card__text">read-only note</span>
          </div>
        </div>`;
    }
  }
  class InnerBadge extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" }).innerHTML = `<span class="badge">inner badge</span>`;
    }
  }
  class OuterPanel extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" }).innerHTML = `
        <div class="panel">
          <inner-badge></inner-badge>
          <inner-badge></inner-badge>
          <p class="panel__hint">outer panel hint</p>
        </div>`;
    }
  }
  class ToolBar extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" }).innerHTML = `
        <div class="bar">
          <button type="button">Action one</button>
          <button type="button" disabled>Disabled</button>
          <button type="button">Delete</button>
        </div>`;
    }
  }
  class LoginForm extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" }).innerHTML = `
        <form onsubmit="return false">
          <input type="text" placeholder="Username" aria-label="Username" data-testid="user-input">
          <button type="submit">Log in</button>
        </form>`;
    }
  }
  class ClosedCard extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "closed" });
      const box = document.createElement("div");
      box.textContent = "secret card";
      const btn = document.createElement("button");
      btn.textContent = "hidden button";
      box.appendChild(btn);
      root.appendChild(box);
    }
  }

  customElements.define("open-card", OpenCard);
  customElements.define("inner-badge", InnerBadge);
  customElements.define("outer-panel", OuterPanel);
  customElements.define("tool-bar", ToolBar);
  customElements.define("login-form", LoginForm);
  customElements.define("closed-card", ClosedCard);
}

function buildTestPage(window) {
  const { document } = window;
  document.body.innerHTML = `
    <section class="demo"><open-card></open-card></section>
    <section class="nested"><outer-panel></outer-panel></section>
    <section class="toolbar"><tool-bar></tool-bar></section>
    <section class="form"><login-form></login-form></section>
    <section class="closed"><closed-card></closed-card></section>
    <section class="plain">
      <button id="plain-btn" type="button">Plain button</button>
      <span class="flex px-4 rounded-full">utility only span</span>
    </section>`;
  return {
    openCard: document.querySelector("open-card"),
    outerPanel: document.querySelector("outer-panel"),
    toolBar: document.querySelector("tool-bar"),
    loginForm: document.querySelector("login-form"),
    closedCard: document.querySelector("closed-card"),
    plainBtn: document.getElementById("plain-btn"),
    plainSection: document.querySelector("section.plain"),
  };
}

// Assign every element (document + open shadow trees) a synthetic nested rect
// so visibility checks and marquee containment behave like a real layout.
function layoutTree(harness, root, left, top, width) {
  harness.layout(root, [left, top, left + width, top + 18]);
  let y = top + 22;
  const kids = Array.from(root.children);
  const shadowRoot = root.shadowRoot;
  if (shadowRoot) kids.push(...Array.from(shadowRoot.children));
  for (const child of kids) {
    layoutTree(harness, child, left + 6, y, Math.max(width - 12, 30));
    y += 20;
  }
}

function layoutPage(harness) {
  const { document } = harness;
  let y = 10;
  for (const section of document.body.children) {
    layoutTree(harness, section, 10, y, 220);
    y += 40;
  }
  harness.layout(document.body, [0, 0, 260, y]);
}

async function createEditorPage({ lang } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
    url: "http://localhost/fixtures/test.html",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const { window } = dom;
  const rects = new WeakMap();
  installGeometryStub(window, rects);

  const copied = [];
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: (text) => { copied.push(String(text)); return Promise.resolve(); } },
    configurable: true,
  });

  if (lang) window.localStorage.setItem("ai-editor-lang", lang);

  defineTestElements(window);
  const page = buildTestPage(window);

  // jsdom finishes parsing asynchronously; wait so the payload's boot path runs
  // init() synchronously instead of deferring to a DOMContentLoaded that races
  // the test.
  if (window.document.readyState === "loading") {
    await new Promise(resolve => window.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  // Inject the real assembled payload as a page script so it runs inside the
  // jsdom window context (document/window globals resolve correctly).
  const script = window.document.createElement("script");
  script.textContent = fs.readFileSync(PAYLOAD_PATH, "utf8");
  window.document.body.appendChild(script);

  const harness = {
    window,
    document: window.document,
    page,
    layout(el, box) { rects.set(el, box); },
    key(key, mods) {
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));
    },
    copyPrompt() { harness.key("c", { code: "KeyC", metaKey: true }); },
    click(el, opts = {}) {
      const box = rects.get(el) || [0, 0, 10, 10];
      const init = {
        bubbles: true, cancelable: true, composed: true, button: 0,
        clientX: (box[0] + box[2]) / 2, clientY: (box[1] + box[3]) / 2, ...opts,
      };
      el.dispatchEvent(new window.MouseEvent("mousedown", init));
      el.dispatchEvent(new window.MouseEvent("mouseup", init));
      el.dispatchEvent(new window.MouseEvent("click", init));
    },
    marquee(el, pad = 6) {
      const [left, top, right, bottom] = rects.get(el);
      const base = { bubbles: true, cancelable: true, button: 0 };
      window.document.dispatchEvent(new window.MouseEvent("mousedown", { ...base, clientX: left - pad, clientY: top - pad }));
      window.document.dispatchEvent(new window.MouseEvent("mousemove", { ...base, clientX: right + pad, clientY: bottom + pad }));
      window.document.dispatchEvent(new window.MouseEvent("mouseup", { ...base, clientX: right + pad, clientY: bottom + pad }));
    },
    labels() {
      return Array.from(window.document.querySelectorAll(".ai-editor-sel-label")).map(n => n.textContent);
    },
    lastPrompt() { return copied[copied.length - 1] || ""; },
  };
  layoutPage(harness);
  return harness;
}

// Evaluate a " >> "-segmented selector the way the acceptance criteria define
// it: every segment chain must match exactly one element within its own tree,
// and each hop must cross an open shadowRoot until the last segment.
function resolveSegmented(window, selector) {
  const parts = selector.split(" >> ");
  let scope = window.document;
  let matches = null;
  for (let i = 0; i < parts.length; i++) {
    let found;
    try { found = Array.from(scope.querySelectorAll(parts[i])); } catch (_) { return { ok: false }; }
    if (found.length !== 1) return { ok: false };
    matches = found;
    scope = found[0].shadowRoot;
    if (!scope && i < parts.length - 1) return { ok: false };
  }
  return { ok: true, el: matches ? matches[0] : null };
}

function selectorLineFrom(prompt) {
  return (prompt.match(/^   selector: (.+)$/m) || [])[1] || "";
}

module.exports = { createEditorPage, resolveSegmented, selectorLineFrom };
