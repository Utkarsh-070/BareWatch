const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    emit(...args) { listeners.forEach((listener) => listener(...args)); }
  };
}

function createChromeMock(initialSettings) {
  const state = {
    settings: structuredClone(initialSettings),
    toolbar: {},
    tabs: [],
    optionsOpened: 0,
    failRead: false,
    failWrite: false,
    failShortcut: false
  };
  const onChanged = createEvent();
  const chrome = {
    storage: {
      local: {
        async get(key) {
          if (state.failRead) throw new Error("Storage read failed");
          return { [key]: structuredClone(state[key]) };
        },
        async set(values) {
          if (state.failWrite) throw new Error("Storage write failed");
          const oldValue = structuredClone(state.settings);
          Object.assign(state, structuredClone(values));
          onChanged.emit({ settings: { oldValue, newValue: structuredClone(state.settings) } }, "local");
        }
      },
      onChanged
    },
    runtime: {
      onInstalled: createEvent(),
      onStartup: createEvent(),
      getURL(file) { return `chrome-extension://test-id/${file}`; },
      getManifest() { return { version: "0.2.0" }; },
      async getPlatformInfo() { return { os: "win", arch: "x86-64" }; },
      async openOptionsPage() { state.optionsOpened += 1; }
    },
    commands: {
      onCommand: createEvent(),
      async getAll() {
        if (state.failShortcut) throw new Error("Shortcut lookup failed");
        return [{ name: "toggle-barewatch", shortcut: "Alt+Shift+F" }];
      }
    },
    action: {
      async setTitle({ title }) { state.toolbar.title = title; },
      async setBadgeBackgroundColor({ color }) { state.toolbar.color = color; },
      async setBadgeText({ text }) { state.toolbar.text = text; }
    },
    tabs: {
      async create(options) { state.tabs.push(options); }
    }
  };
  return { chrome, state };
}

function createContext(globals = {}) {
  const errors = [];
  const context = vm.createContext({
    console: { log() {}, error(...args) { errors.push(args); } },
    ...globals
  });
  context.importScripts = (...files) => {
    files.forEach((file) => loadScript(context, path.join("background", file)));
  };
  return { context, errors };
}

function loadScript(context, relativePath) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

function createPageDocument(relativePath) {
  const markup = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  const elements = new Map();
  const settingControls = [];
  const allControls = [];
  const appended = [];

  function createElement(tagName) {
    const events = new Map();
    const classes = new Set();
    return {
      tagName,
      dataset: {},
      checked: false,
      disabled: false,
      textContent: "",
      value: "",
      style: {},
      files: [],
      classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      addEventListener(type, listener) { events.set(type, listener); },
      trigger(type) { return events.get(type)?.(); },
      setAttribute() {},
      select() {},
      click() { return events.get("click")?.(); },
      remove() {
        const index = appended.indexOf(this);
        if (index !== -1) appended.splice(index, 1);
      }
    };
  }

  for (const match of markup.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const element = createElement(match[1]);
    const settingName = match[2].match(/data-setting="([^"]+)"/)?.[1];
    if (settingName) {
      element.dataset.setting = settingName;
      settingControls.push(element);
    }
    if (["button", "input"].includes(match[1])) allControls.push(element);
    elements.set(`#${match[3]}`, element);
  }
  if (markup.includes("data-version")) elements.set("[data-version]", createElement("span"));

  return {
    elements,
    settingControls,
    appended,
    body: { append(element) { appended.push(element); } },
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll(selector) {
      if (selector === "[data-setting]") return settingControls;
      if (selector === "button, input") return allControls;
      throw new Error(`Unexpected selector: ${selector}`);
    },
    createElement,
    execCommand() { return true; }
  };
}

module.exports = { createChromeMock, createContext, createEvent, createPageDocument, flushPromises, loadScript };
