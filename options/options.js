(() => {
  "use strict";

  const settingsApi = globalThis.BareWatchSettings;
  const settingControls = [...document.querySelectorAll("[data-setting]")];
  const pageControls = [...document.querySelectorAll("button, input")];
  const statusLabel = document.querySelector("#saveStatus");
  const importInput = document.querySelector("#importFile");
  const shortcutLabel = document.querySelector("#shortcutValue");
  const MAX_IMPORT_BYTES = 64 * 1024;
  let settings = { ...settingsApi.DEFAULT_SETTINGS };
  let statusTimeout;

  document.querySelector("[data-version]").textContent = `Beta · v${chrome.runtime.getManifest().version}`;

  function setControlsDisabled(disabled) {
    for (const control of pageControls) {
      control.disabled = disabled;
    }
  }

  function showStatus(message, isError = false) {
    clearTimeout(statusTimeout);
    statusLabel.textContent = message;
    statusLabel.className = isError ? "save-status error" : "save-status success";

    if (!isError) {
      statusTimeout = setTimeout(() => {
        statusLabel.textContent = "Changes save automatically";
        statusLabel.className = "save-status";
      }, 2200);
    }
  }

  function renderSettings() {
    for (const control of settingControls) {
      control.checked = settings[control.dataset.setting];
    }
  }

  async function saveChanges(changes, message = "Saved") {
    settings = await settingsApi.updateSettings(changes);
    renderSettings();
    showStatus(message);
  }

  async function runAction(action, failureMessage) {
    setControlsDisabled(true);

    try {
      await action();
    } catch (error) {
      console.error(failureMessage, error);
      renderSettings();
      showStatus(failureMessage, true);
    } finally {
      setControlsDisabled(false);
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Some browsers deny clipboard access even after a button click.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);

    try {
      textarea.select();
      if (!document.execCommand("copy")) {
        throw new Error("Clipboard access was unavailable.");
      }
    } finally {
      textarea.remove();
    }
  }

  async function getShortcut() {
    const commands = await chrome.commands.getAll();
    return commands.find((command) => command.name === "toggle-barewatch")?.shortcut || "Not assigned";
  }

  for (const control of settingControls) {
    control.addEventListener("change", () => {
      const changes = { [control.dataset.setting]: control.checked };
      runAction(() => saveChanges(changes), "Couldn't save settings. Try again.");
    });
  }

  document.querySelector("#deepFocus").addEventListener("click", () => {
    runAction(
      () => saveChanges(settingsApi.getDeepFocusSettings(), "Deep Focus is on"),
      "Couldn't enable Deep Focus. Try again."
    );
  });

  document.querySelector("#recommended").addEventListener("click", () => {
    const recommendedSettings = { ...settingsApi.DEFAULT_SETTINGS };
    delete recommendedSettings.showBadge;
    runAction(() => saveChanges(recommendedSettings, "Recommended settings applied"), "Couldn't save settings. Try again.");
  });

  document.querySelector("#resetSettings").addEventListener("click", () => {
    if (window.confirm("Reset all BareWatch settings to their defaults?")) {
      runAction(() => saveChanges(settingsApi.DEFAULT_SETTINGS, "Defaults restored"), "Couldn't reset settings. Try again.");
    }
  });

  document.querySelector("#exportSettings").addEventListener("click", () => {
    runAction(async () => {
      const payload = {
        product: "BareWatch",
        formatVersion: 1,
        extensionVersion: chrome.runtime.getManifest().version,
        exportedAt: new Date().toISOString(),
        settings: await settingsApi.getSettings()
      };
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `barewatch-settings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);

      try {
        link.click();
        showStatus("Settings exported");
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }, "Couldn't export settings. Try again.");
  });

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;

    runAction(async () => {
      if (file.size > MAX_IMPORT_BYTES) {
        showStatus("Choose a settings file smaller than 64 KB.", true);
        return;
      }

      let importedSettings;
      try {
        importedSettings = settingsApi.parseImportedSettings(await file.text());
      } catch (error) {
        showStatus(error.message || "Couldn't read that settings file.", true);
        return;
      }

      await saveChanges(importedSettings, "Settings imported");
    }, "Couldn't import settings. Try again.");
  });

  document.querySelector("#copyDiagnostics").addEventListener("click", () => {
    runAction(async () => {
      const [platform, shortcut, savedSettings] = await Promise.all([
        chrome.runtime.getPlatformInfo(),
        getShortcut(),
        settingsApi.getSettings()
      ]);
      const diagnostics = {
        product: "BareWatch",
        version: chrome.runtime.getManifest().version,
        schemaVersion: settingsApi.CURRENT_SCHEMA_VERSION,
        platform: { os: platform.os, arch: platform.arch },
        shortcut,
        settings: savedSettings
      };

      await copyText(JSON.stringify(diagnostics, null, 2));
      showStatus("Diagnostics copied");
    }, "Couldn't copy diagnostics. Try again.");
  });

  document.querySelector("#openShortcuts").addEventListener("click", () => {
    const browserScheme = navigator.userAgent.includes("Edg/") ? "edge" : "chrome";
    runAction(
      () => chrome.tabs.create({ url: `${browserScheme}://extensions/shortcuts` }),
      "Couldn't open shortcuts. Open the browser's extension settings."
    );
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) {
      settings = settingsApi.mergeWithDefaults(changes.settings.newValue);
      renderSettings();
    }
  });

  setControlsDisabled(true);
  showStatus("Loading settings…");

  settingsApi.ensureMigratedSettings()
    .then((savedSettings) => {
      settings = savedSettings;
      renderSettings();
      setControlsDisabled(false);
      showStatus("Settings loaded");
    })
    .catch((error) => {
      console.error("BareWatch could not read settings.", error);
      showStatus("Couldn't load settings. Reload this page.", true);
    });

  getShortcut()
    .then((shortcut) => { shortcutLabel.textContent = shortcut; })
    .catch(() => { shortcutLabel.textContent = "Check extension shortcuts"; });
})();
