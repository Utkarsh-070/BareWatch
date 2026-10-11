const assert = require("node:assert/strict");
const test = require("node:test");
const { createChromeMock, createContext, createPageDocument, flushPromises, loadScript } = require("./helpers");

function openPage(pageName, chrome, overrides = {}) {
  const document = createPageDocument(`${pageName}/${pageName}.html`);
  const clipboard = [];
  const timers = new Map();
  let nextTimer = 0;
  const globals = {
    chrome,
    document,
    window: { close() {}, confirm() { return true; } },
    navigator: {
      userAgent: "Chrome/130",
      clipboard: { async writeText(text) { clipboard.push(text); } }
    },
    Blob,
    URL,
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    ...overrides
  };
  const { context, errors } = createContext(globals);
  if (pageName !== "welcome") loadScript(context, "shared/settings.js");
  loadScript(context, `${pageName}/${pageName}.js`);
  return { document, context, errors, clipboard, timers };
}

test("popup and options share Deep Focus and stay in sync with other writers", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2, showBadge: false });
  const popup = openPage("popup", chrome);
  const options = openPage("options", chrome);
  await flushPromises();

  popup.document.querySelector("#focusMode").click();
  await flushPromises();
  for (const [key, value] of Object.entries(state.settings)) {
    if (key.startsWith("hide")) assert.equal(value, true, `${key} wasn't enabled`);
  }
  assert.equal(state.settings.showBadge, false);
  assert.equal(options.document.querySelector("#hideExplore").checked, true);

  await chrome.storage.local.set({ settings: { ...state.settings, enabled: false, hideComments: false } });
  assert.equal(popup.document.querySelector("#enabled").checked, false);
  assert.equal(options.document.querySelector("#enabled").checked, false);
  assert.equal(popup.document.querySelector("#hideComments").checked, false);

  options.document.querySelector("#deepFocus").click();
  await flushPromises();
  assert.equal(popup.document.querySelector("#enabled").checked, true);
  assert.equal(state.settings.hideComments, true);
  assert.equal(popup.document.querySelector("[data-version]").textContent, "Beta · v0.2.0");
  assert.equal(popup.errors.length + options.errors.length, 0);
});

test("recommended settings preserve the badge preference", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2, showBadge: false, hideExplore: true });
  const page = openPage("options", chrome);
  await flushPromises();
  page.document.querySelector("#recommended").click();
  await flushPromises();
  assert.equal(state.settings.showBadge, false);
  assert.equal(state.settings.hideExplore, false);
});

for (const pageName of ["popup", "options"]) {
  test(`${pageName} restores the saved checkbox and keeps save errors visible`, async () => {
    const { chrome, state } = createChromeMock({ schemaVersion: 2, hideComments: false });
    const page = openPage(pageName, chrome);
    await flushPromises();
    state.failWrite = true;
    const checkbox = page.document.querySelector("#hideComments");
    checkbox.checked = true;
    checkbox.trigger("change");
    await flushPromises();
    assert.equal(checkbox.checked, false);
    assert.equal(checkbox.disabled, false);
    assert.equal(state.settings.hideComments, false);
    assert.match(page.document.querySelector(pageName === "popup" ? "#status" : "#saveStatus").textContent, /Couldn't save/);
    assert.equal(page.timers.size, 0);
  });

  test(`${pageName} keeps controls disabled when the initial storage read fails`, async () => {
    const { chrome, state } = createChromeMock({ schemaVersion: 2 });
    state.failRead = true;
    const page = openPage(pageName, chrome);
    await flushPromises();
    assert.ok(page.document.settingControls.every((control) => control.disabled));
    assert.equal(page.timers.size, 0);
  });
}

test("shortcut lookup failure doesn't stop the options page loading settings", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2, hideComments: true });
  state.failShortcut = true;
  const page = openPage("options", chrome);
  await flushPromises();
  assert.equal(page.document.querySelector("#hideComments").checked, true);
  assert.equal(page.document.querySelector("#hideComments").disabled, false);
  assert.equal(page.document.querySelector("#shortcutValue").textContent, "Check extension shortcuts");
});

test("invalid or oversized imports leave the stored settings unchanged", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2, hideComments: true });
  const page = openPage("options", chrome);
  await flushPromises();
  const input = page.document.querySelector("#importFile");

  for (const file of [
    { size: 10, async text() { return '{"settings":{"enabled":"yes"}}'; } },
    { size: 65537, async text() { throw new Error("Oversized file shouldn't be read"); } }
  ]) {
    input.files = [file];
    input.trigger("change");
    await flushPromises();
    assert.equal(state.settings.hideComments, true);
    assert.equal(page.document.querySelector("#saveStatus").className, "save-status error");
  }
});

test("a failed import write reports failure rather than success", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2, enabled: true });
  const page = openPage("options", chrome);
  await flushPromises();
  state.failWrite = true;
  const input = page.document.querySelector("#importFile");
  input.files = [{ size: 20, async text() { return '{"settings":{"enabled":false}}'; } }];
  input.trigger("change");
  await flushPromises();
  assert.equal(state.settings.enabled, true);
  assert.match(page.document.querySelector("#saveStatus").textContent, /Couldn't import/);
});

test("diagnostics contain only version, platform, shortcut, and current preferences", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2, enabled: true });
  const page = openPage("options", chrome);
  await flushPromises();
  await chrome.storage.local.set({ settings: { ...state.settings, enabled: false, videoUrl: "private data" } });
  page.document.querySelector("#copyDiagnostics").click();
  await flushPromises();
  const diagnostics = JSON.parse(page.clipboard[0]);
  assert.deepEqual(Object.keys(diagnostics).sort(), ["platform", "product", "schemaVersion", "settings", "shortcut", "version"]);
  assert.equal(diagnostics.settings.enabled, false);
  assert.equal(diagnostics.settings.videoUrl, undefined);
});

test("export reads the current preferences and removes its temporary link", async () => {
  const { chrome } = createChromeMock({ schemaVersion: 2, enabled: false });
  let exportedBlob;
  const page = openPage("options", chrome, {
    URL: {
      createObjectURL(blob) { exportedBlob = blob; return "blob:settings"; },
      revokeObjectURL() {}
    }
  });
  await flushPromises();
  page.document.querySelector("#exportSettings").click();
  await flushPromises();
  const payload = JSON.parse(await exportedBlob.text());
  assert.equal(payload.product, "BareWatch");
  assert.equal(payload.settings.enabled, false);
  assert.equal(page.document.appended.length, 0);
});

test("clipboard fallback cleans up its temporary textarea", async () => {
  const { chrome } = createChromeMock({ schemaVersion: 2 });
  const page = openPage("options", chrome, {
    navigator: { userAgent: "Chrome", clipboard: { async writeText() { throw new Error("Denied"); } } }
  });
  await flushPromises();
  page.document.querySelector("#copyDiagnostics").click();
  await flushPromises();
  assert.equal(page.document.appended.length, 0);
  assert.equal(page.errors.length, 0);
});

test("Edge uses its own extension-shortcuts URL", async () => {
  const { chrome, state } = createChromeMock({ schemaVersion: 2 });
  const page = openPage("options", chrome, { navigator: { userAgent: "Edg/130" } });
  await flushPromises();
  page.document.querySelector("#openShortcuts").click();
  await flushPromises();
  assert.equal(state.tabs[0].url, "edge://extensions/shortcuts");
});

test("welcome page opens settings and handles an unassigned shortcut", async () => {
  const { chrome, state } = createChromeMock();
  chrome.commands.getAll = async () => [];
  const page = openPage("welcome", chrome);
  await flushPromises();
  await page.document.querySelector("#openSettings").click();
  assert.equal(state.optionsOpened, 1);
  assert.equal(page.document.querySelector("#shortcutValue").textContent, "Set one in extension shortcuts");
});
