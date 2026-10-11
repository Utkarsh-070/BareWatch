const assert = require("node:assert/strict");
const test = require("node:test");
const { createChromeMock, createContext, loadScript } = require("./helpers");

function loadSettings(initialSettings) {
  const { chrome, state } = createChromeMock(initialSettings);
  const { context } = createContext({ chrome });
  loadScript(context, "shared/settings.js");
  return { settingsApi: context.BareWatchSettings, state };
}

test("defaults preserve valid choices and discard invalid or unknown fields", () => {
  const { settingsApi } = loadSettings();
  const settings = settingsApi.mergeWithDefaults({
    enabled: "no",
    hideComments: true,
    unknownOption: true,
    schemaVersion: 1
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.hideComments, true);
  assert.equal(settings.unknownOption, undefined);
  assert.equal(settings.schemaVersion, settingsApi.CURRENT_SCHEMA_VERSION);
  assert.equal(settingsApi.mergeWithDefaults([]).showBadge, true);
});

test("settings save and load round-trip through local storage", async () => {
  const { settingsApi } = loadSettings();
  const saved = await settingsApi.saveSettings({ enabled: false, hideComments: true });
  assert.deepEqual(await settingsApi.getSettings(), saved);
});

test("single-setting updates preserve the other saved preferences", async () => {
  const { settingsApi, state } = loadSettings({ enabled: false, hideExplore: true, showBadge: false });
  await settingsApi.updateSettings({ hideComments: true });
  assert.equal(state.settings.enabled, false);
  assert.equal(state.settings.hideExplore, true);
  assert.equal(state.settings.showBadge, false);
  assert.equal(state.settings.hideComments, true);
});

test("Deep Focus enables every hide setting without changing the badge choice", async () => {
  const { settingsApi, state } = loadSettings({ enabled: false, showBadge: false });
  await settingsApi.updateSettings(settingsApi.getDeepFocusSettings());
  assert.equal(state.settings.enabled, true);
  assert.equal(state.settings.showBadge, false);
  for (const key of settingsApi.BOOLEAN_KEYS.filter((name) => name.startsWith("hide"))) {
    assert.equal(state.settings[key], true, key);
  }
});

test("imports accept wrapped and legacy settings and fill in defaults", () => {
  const { settingsApi } = loadSettings();
  for (const payload of [
    { product: "BareWatch", settings: { enabled: false, hideComments: true, unknown: true } },
    { enabled: false, hideComments: true }
  ]) {
    const imported = settingsApi.parseImportedSettings(JSON.stringify(payload));
    assert.equal(imported.enabled, false);
    assert.equal(imported.hideComments, true);
    assert.equal(imported.unknown, undefined);
    assert.equal(imported.schemaVersion, settingsApi.CURRENT_SCHEMA_VERSION);
  }
});

test("imports reject invalid JSON, wrong products, missing fields, and invalid booleans", () => {
  const { settingsApi } = loadSettings();
  for (const text of [
    "not JSON",
    "null",
    "[]",
    "{}",
    '{"product":"Another extension","settings":{"enabled":true}}',
    '{"settings":{"enabled":"yes"}}',
    '{"settings":[]}',
    '{"settings":{"unknown":true}}'
  ]) {
    assert.throws(() => settingsApi.parseImportedSettings(text));
  }
});

test("migration fills in new defaults and preserves older choices", async () => {
  const { settingsApi, state } = loadSettings({ schemaVersion: 1, enabled: false, hideComments: true });
  const migrated = await settingsApi.ensureMigratedSettings();
  assert.equal(migrated.schemaVersion, settingsApi.CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.enabled, false);
  assert.equal(migrated.hideComments, true);
  assert.equal(migrated.showBadge, true);
  assert.equal(state.settings.schemaVersion, settingsApi.CURRENT_SCHEMA_VERSION);
});

test("a fresh install stores the defaults", async () => {
  const { settingsApi, state } = loadSettings();
  await settingsApi.ensureMigratedSettings();
  assert.equal(state.settings.enabled, true);
  assert.equal(state.settings.schemaVersion, settingsApi.CURRENT_SCHEMA_VERSION);
});
