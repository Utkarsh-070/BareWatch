(() => {
  "use strict";

  const shortcutLabel = document.querySelector("#shortcutValue");

  document.querySelector("#openSettings").addEventListener("click", async () => {
    try {
      await chrome.runtime.openOptionsPage();
    } catch (error) {
      console.error("BareWatch could not open settings.", error);
      document.querySelector("#status").textContent = "Couldn't open settings. Try the BareWatch popup.";
    }
  });

  chrome.commands.getAll()
    .then((commands) => {
      const shortcut = commands.find((command) => command.name === "toggle-barewatch")?.shortcut;
      shortcutLabel.textContent = shortcut || "Set one in extension shortcuts";
    })
    .catch(() => {
      shortcutLabel.textContent = "Set one in extension shortcuts";
    });
})();
