importScripts("../shared/settings.js");

const settingsApi = globalThis.BareWatchSettings;

async function updateToolbar(settings) {
  const activeSettings = settingsApi.mergeWithDefaults(settings);
  const isEnabled = activeSettings.enabled;

  await chrome.action.setTitle({
    title: isEnabled ? "BareWatch is on" : "BareWatch is paused"
  });

  await chrome.action.setBadgeBackgroundColor({
    color: isEnabled ? "#ff3158" : "#6b7280"
  });

  await chrome.action.setBadgeText({
    text: activeSettings.showBadge ? (isEnabled ? "ON" : "OFF") : ""
  });
}

async function initializeExtension(details) {
  const settings = await settingsApi.ensureMigratedSettings();
  await updateToolbar(settings);

  if (details.reason === "install") {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("welcome/welcome.html")
    });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  initializeExtension(details).catch((error) => {
    console.error("BareWatch setup failed.", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  settingsApi.getSettings()
    .then(updateToolbar)
    .catch((error) => console.error("BareWatch startup failed.", error));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.settings) {
    updateToolbar(changes.settings.newValue)
      .catch((error) => console.error("BareWatch badge update failed.", error));
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-barewatch") return;

  settingsApi.getSettings()
    .then((settings) => settingsApi.saveSettings({
      ...settings,
      enabled: !settings.enabled
    }))
    .catch((error) => console.error("BareWatch shortcut failed.", error));
});

settingsApi.getSettings()
  .then(updateToolbar)
  .catch((error) => console.error("BareWatch badge initialization failed.", error));
