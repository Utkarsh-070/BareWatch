const assert = require("node:assert/strict");
const test = require("node:test");
const { createChromeMock, createContext, flushPromises, loadScript } = require("./helpers");

function loadBackground(initialSettings) {
  const { chrome, state } = createChromeMock(initialSettings);
  const { context, errors } = createContext({ chrome });
  loadScript(context, "background/service-worker.js");
  return { chrome, state, errors };
}

test("installation migrates settings, updates the badge, and opens the welcome page", async () => {
  const { chrome, state, errors } = loadBackground({
    schemaVersion: 1, enabled: true, hideHomeFeed: false, hideComments: true
  });
  chrome.runtime.onInstalled.emit({ reason: "install" });
  await flushPromises();
  assert.equal(state.settings.schemaVersion, 2);
  assert.equal(state.settings.hideHomeFeed, false);
  assert.equal(state.settings.hideComments, true);
  assert.equal(state.tabs[0].url, "chrome-extension://test-id/welcome/welcome.html");
  assert.equal(state.toolbar.text, "ON");
  assert.equal(state.toolbar.title, "BareWatch is on");
  assert.equal(errors.length, 0);
});

test("updating the extension preserves choices without opening onboarding again", async () => {
  const { chrome, state } = loadBackground({ schemaVersion: 1, enabled: false, hideComments: true });
  chrome.runtime.onInstalled.emit({ reason: "update" });
  await flushPromises();
  assert.equal(state.settings.enabled, false);
  assert.equal(state.settings.hideComments, true);
  assert.equal(state.tabs.length, 0);
  assert.equal(state.toolbar.text, "OFF");
});

test("the keyboard shortcut toggles settings and the toolbar badge", async () => {
  const { chrome, state } = loadBackground({ schemaVersion: 2, enabled: true });
  await flushPromises();
  chrome.commands.onCommand.emit("toggle-barewatch");
  await flushPromises();
  assert.equal(state.settings.enabled, false);
  assert.equal(state.toolbar.text, "OFF");
  assert.equal(state.toolbar.title, "BareWatch is paused");
  chrome.commands.onCommand.emit("toggle-barewatch");
  await flushPromises();
  assert.equal(state.settings.enabled, true);
  assert.equal(state.toolbar.text, "ON");
});

test("unrelated commands leave the preferences unchanged", async () => {
  const { chrome, state } = loadBackground({ schemaVersion: 2, enabled: true });
  await flushPromises();
  chrome.commands.onCommand.emit("other-command");
  await flushPromises();
  assert.equal(state.settings.enabled, true);
});

test("startup restores the toolbar state and respects a hidden badge", async () => {
  const { chrome, state } = loadBackground({ schemaVersion: 2, enabled: false, showBadge: false });
  chrome.runtime.onStartup.emit();
  await flushPromises();
  assert.equal(state.toolbar.title, "BareWatch is paused");
  assert.equal(state.toolbar.text, "");
  assert.equal(state.tabs.length, 0);
});

test("clearing settings makes the toolbar match the default enabled state", async () => {
  const { chrome, state } = loadBackground({ schemaVersion: 2, enabled: false });
  await flushPromises();
  state.settings = undefined;
  chrome.storage.onChanged.emit({ settings: { newValue: undefined } }, "local");
  await flushPromises();
  assert.equal(state.toolbar.text, "ON");
});
