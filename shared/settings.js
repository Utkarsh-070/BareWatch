(() => {
  "use strict";

  const CURRENT_SCHEMA_VERSION = 2;

  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: true,
    hideHomeFeed: true,
    hideShorts: true,
    hideRelatedVideos: true,
    hideComments: false,
    hideEndScreens: true,
    hideLiveChat: false,
    hideExplore: false,
    hideNotifications: false,
    hideHomeCategories: false,
    showBadge: true
  });

  const BOOLEAN_KEYS = Object.freeze([
    "enabled",
    "hideHomeFeed",
    "hideShorts",
    "hideRelatedVideos",
    "hideComments",
    "hideEndScreens",
    "hideLiveChat",
    "hideExplore",
    "hideNotifications",
    "hideHomeCategories",
    "showBadge"
  ]);

  function mergeWithDefaults(savedSettings) {
    const saved = savedSettings && typeof savedSettings === "object" && !Array.isArray(savedSettings)
      ? savedSettings
      : {};
    const merged = { ...DEFAULT_SETTINGS };

    for (const key of BOOLEAN_KEYS) {
      if (typeof saved[key] === "boolean") {
        merged[key] = saved[key];
      }
    }

    return merged;
  }

  function parseImportedSettings(jsonText) {
    let parsed;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("That file is not valid JSON.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("That file does not contain a settings object.");
    }

    if (parsed.product !== undefined && parsed.product !== "BareWatch") {
      throw new Error("That file was not exported by BareWatch.");
    }

    const candidate = parsed.settings ?? parsed;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("The BareWatch settings are missing.");
    }

    const recognizedKeys = BOOLEAN_KEYS.filter((key) => Object.hasOwn(candidate, key));
    if (recognizedKeys.length === 0) {
      throw new Error("No recognized BareWatch settings were found.");
    }

    for (const key of recognizedKeys) {
      if (typeof candidate[key] !== "boolean") {
        throw new Error(`The setting "${key}" must be true or false.`);
      }
    }

    return mergeWithDefaults(candidate);
  }

  async function getSettings() {
    const result = await chrome.storage.local.get("settings");
    return mergeWithDefaults(result.settings);
  }

  async function saveSettings(nextSettings) {
    const settings = mergeWithDefaults(nextSettings);
    await chrome.storage.local.set({ settings });
    return settings;
  }

  async function updateSettings(changes) {
    const settings = await getSettings();
    return saveSettings({ ...settings, ...changes });
  }

  function getDeepFocusSettings() {
    const settings = { enabled: true };

    for (const key of BOOLEAN_KEYS) {
      if (key.startsWith("hide")) {
        settings[key] = true;
      }
    }

    return settings;
  }

  async function ensureMigratedSettings() {
    const result = await chrome.storage.local.get("settings");
    const saved = result.settings;
    const settings = mergeWithDefaults(saved);
    const savedSchema = Number.isInteger(saved?.schemaVersion)
      ? saved.schemaVersion
      : 0;

    if (!saved || savedSchema < CURRENT_SCHEMA_VERSION) {
      await chrome.storage.local.set({ settings });
    }

    return settings;
  }

  globalThis.BareWatchSettings = Object.freeze({
    CURRENT_SCHEMA_VERSION,
    DEFAULT_SETTINGS,
    BOOLEAN_KEYS,
    mergeWithDefaults,
    parseImportedSettings,
    getSettings,
    saveSettings,
    updateSettings,
    getDeepFocusSettings,
    ensureMigratedSettings
  });
})();
