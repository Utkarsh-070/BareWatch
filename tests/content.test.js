const assert = require("node:assert/strict");
const test = require("node:test");
const { createChromeMock, createContext, flushPromises, loadScript } = require("./helpers");

class ElementFixture {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = { ...attributes };
    this.children = [];
    this.parent = null;
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => { enabled ? this.classes.add(name) : this.classes.delete(name); },
      contains: (name) => this.classes.has(name)
    };
  }

  append(child) {
    child.parent = this;
    this.children.push(child);
  }

  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name]; }

  matches(selector) {
    return selector.split(",").some((part) => {
      const rule = part.trim();
      const linkPrefix = rule.match(/^a\[href\^="([^"]+)"\]$/)?.[1];
      if (linkPrefix) return this.tagName === "a" && this.attributes.href?.startsWith(linkPrefix);
      if (rule.startsWith("[")) return Object.hasOwn(this.attributes, rule.slice(1, -1));
      return this.tagName === rule;
    });
  }

  closest(selector) {
    for (let element = this; element; element = element.parent) {
      if (element.matches(selector)) return element;
    }
    return null;
  }

  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
}

class DocumentFixture {
  constructor() { this.documentElement = new ElementFixture("html"); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

function loadContent(initialSettings) {
  const { chrome, state } = createChromeMock(initialSettings);
  const document = new DocumentFixture();
  const card = new ElementFixture("ytd-rich-item-renderer");
  const link = new ElementFixture("a", { href: "/shorts/first" });
  card.append(link);
  document.documentElement.append(card);
  const frames = [];
  const events = new Map();
  const location = { href: "https://www.youtube.com/", pathname: "/" };
  let observer;

  const { context, errors } = createContext({
    chrome,
    document,
    location,
    Document: DocumentFixture,
    Element: ElementFixture,
    window: { addEventListener(name, callback) { events.set(name, callback); } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe(target, options) { this.options = options; }
    }
  });
  loadScript(context, "shared/settings.js");
  loadScript(context, "content/content.js");

  return {
    chrome, state, document, card, link, location, errors,
    notify(record) { observer.callback([{ addedNodes: [], ...record }]); },
    flushFrames() { frames.splice(0).forEach((callback) => callback()); },
    navigate(pathname) {
      location.pathname = pathname;
      location.href = `https://www.youtube.com${pathname}`;
      events.get("yt-navigate-finish")();
    },
    observerOptions() { return observer.options; },
    pendingFrameCount() { return frames.length; }
  };
}

test("content settings and route classes update without reloading", async () => {
  const page = loadContent({ schemaVersion: 2, enabled: true, hideShorts: true });
  await flushPromises();
  const root = page.document.documentElement;
  assert.equal(root.classList.contains("barewatch-route-home"), true);
  assert.equal(page.card.getAttribute("data-barewatch-shorts"), "true");

  page.navigate("/watch");
  assert.equal(root.classList.contains("barewatch-route-home"), false);
  assert.equal(root.classList.contains("barewatch-route-watch"), true);

  await page.chrome.storage.local.set({ settings: { ...page.state.settings, enabled: false } });
  assert.equal(root.classList.contains("barewatch-enabled"), false);
  assert.equal(page.card.children.length, 1, "Pausing shouldn't delete YouTube nodes");

  await page.chrome.storage.local.set({ settings: { ...page.state.settings, enabled: true } });
  assert.equal(root.classList.contains("barewatch-enabled"), true);
  assert.equal(page.errors.length, 0);
});

test("reused Shorts cards lose their marker when the link becomes a normal video", async () => {
  const page = loadContent({ schemaVersion: 2, hideShorts: true });
  await flushPromises();
  page.link.setAttribute("href", "/watch?v=normal");
  page.notify({ type: "attributes", target: page.link, attributeName: "href" });
  page.flushFrames();
  assert.equal(page.card.getAttribute("data-barewatch-shorts"), undefined);
  assert.equal(page.observerOptions().attributes, true);

  page.link.setAttribute("href", "/shorts/second");
  page.notify({ type: "attributes", target: page.link, attributeName: "href" });
  page.flushFrames();
  assert.equal(page.card.getAttribute("data-barewatch-shorts"), "true");
});

test("new Shorts links in an existing card are marked in one animation frame", async () => {
  const page = loadContent({ schemaVersion: 2, hideShorts: false });
  await flushPromises();
  page.link.setAttribute("href", "/watch?v=normal");
  await page.chrome.storage.local.set({ settings: { ...page.state.settings, hideShorts: true } });
  const newLink = new ElementFixture("a", { href: "/shorts/new" });
  page.card.append(newLink);
  page.notify({ type: "childList", target: page.card, addedNodes: [newLink] });
  page.notify({ type: "childList", target: page.card, addedNodes: [newLink] });
  assert.equal(page.pendingFrameCount(), 1);
  page.flushFrames();
  assert.equal(page.card.getAttribute("data-barewatch-shorts"), "true");
});
