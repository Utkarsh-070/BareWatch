(() => {
  "use strict";

  const settingsApi = globalThis.BareWatchSettings;
  const settingControls = [...document.querySelectorAll("[data-setting]")];
  const statusLabel = document.querySelector("#status");
  const focusButton = document.querySelector("#focusMode");
  const resetButton = document.querySelector("#resetDefaults");
  const optionsButton = document.querySelector("#openOptions");
  let settings = { ...settingsApi.DEFAULT_SETTINGS };
  let statusTimeout;

  document.querySelector("[data-version]").textContent = `Beta · v${chrome.runtime.getManifest().version}`;

  function setControlsDisabled(disabled) {
    for (const control of [...settingControls, focusButton, resetButton]) {
      control.disabled = disabled;
    }
  }

  function showStatus(message, isError = false) {
    clearTimeout(statusTimeout);
    statusLabel.textContent = message;
    statusLabel.classList.toggle("error", isError);

    if (!isError) {
      statusTimeout = setTimeout(() => {
        statusLabel.textContent = "Ready";
      }, 1400);
    }
  }

  function renderSettings() {
    for (const control of settingControls) {
      control.checked = settings[control.dataset.setting];
    }
  }

  async function saveChanges(changes, message = "Saved") {
    setControlsDisabled(true);

    try {
      settings = await settingsApi.updateSettings(changes);
      showStatus(message);
    } catch (error) {
      console.error("BareWatch could not save settings.", error);
      showStatus("Couldn't save. Try again.", true);
    } finally {
      renderSettings();
      setControlsDisabled(false);
    }
  }

  for (const control of settingControls) {
    control.addEventListener("change", () => {
      saveChanges({ [control.dataset.setting]: control.checked });
    });
  }

  focusButton.addEventListener("click", () => {
    saveChanges(settingsApi.getDeepFocusSettings(), "Deep Focus is on");
  });

  resetButton.addEventListener("click", () => {
    saveChanges(settingsApi.DEFAULT_SETTINGS, "Defaults restored");
  });

  optionsButton.addEventListener("click", async () => {
    try {
      await chrome.runtime.openOptionsPage();
      window.close();
    } catch (error) {
      console.error("BareWatch could not open settings.", error);
      showStatus("Couldn't open settings.", true);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) {
      settings = settingsApi.mergeWithDefaults(changes.settings.newValue);
      renderSettings();
    }
  });

  setControlsDisabled(true);
  showStatus("Loading settings…");

  settingsApi.getSettings()
    .then((savedSettings) => {
      settings = savedSettings;
      renderSettings();
      setControlsDisabled(false);
      showStatus("Ready");
    })
    .catch((error) => {
      console.error("BareWatch could not read settings.", error);
      showStatus("Couldn't load settings. Reopen the popup.", true);
    });
})();
