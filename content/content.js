(() => {
  "use strict";

  const settingsApi = globalThis.BareWatchSettings;
  if (!settingsApi) {
    console.error("BareWatch could not load its settings helper.");
    return;
  }

  const SETTING_CLASSES = Object.freeze({
    hideHomeFeed: "barewatch-hide-home",
    hideShorts: "barewatch-hide-shorts",
    hideRelatedVideos: "barewatch-hide-related",
    hideComments: "barewatch-hide-comments",
    hideEndScreens: "barewatch-hide-end-screens",
    hideLiveChat: "barewatch-hide-live-chat",
    hideExplore: "barewatch-hide-explore",
    hideNotifications: "barewatch-hide-notifications",
    hideHomeCategories: "barewatch-hide-home-categories"
  });

  const CARD_SELECTOR = [
    "ytd-guide-entry-renderer",
    "ytd-mini-guide-entry-renderer",
    "ytd-reel-shelf-renderer",
    "ytd-rich-section-renderer",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model"
  ].join(",");

  const LINK_RULES = Object.freeze([
    Object.freeze({
      setting: "hideShorts",
      selector: 'a[href^="/shorts/"]',
      attribute: "data-barewatch-shorts",
      containerSelector: CARD_SELECTOR
    }),
    Object.freeze({
      setting: "hideExplore",
      selector: 'a[href^="/feed/explore"], a[href^="/feed/trending"]',
      attribute: "data-barewatch-explore",
      containerSelector: "ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer"
    })
  ]);

  let settings = { ...settingsApi.DEFAULT_SETTINGS };
  let previousUrl = location.href;
  let mutationObserver;
  let animationFrameId = 0;
  const pendingRoots = new Set();

  function setRouteClasses() {
    const root = document.documentElement;
    if (!root) return;

    const path = location.pathname;
    root.classList.toggle("barewatch-route-home", path === "/");
    root.classList.toggle("barewatch-route-watch", path === "/watch");
    root.classList.toggle("barewatch-route-shorts", path.startsWith("/shorts/"));
  }

  function applySettings(nextSettings) {
    settings = settingsApi.mergeWithDefaults(nextSettings);
    const root = document.documentElement;
    if (!root) return;

    root.classList.toggle("barewatch-enabled", settings.enabled);

    for (const [settingName, className] of Object.entries(SETTING_CLASSES)) {
      root.classList.toggle(className, settings[settingName]);
    }

    setRouteClasses();

    if (settings.enabled) {
      updateMarkedLinks(document);
    }
  }

  function markLink(link, rule) {
    const container = link.closest(rule.containerSelector);
    (container || link).setAttribute(rule.attribute, "true");
  }

  function updateMarkedLinks(root) {
    if (!(root instanceof Document || root instanceof Element)) return;

    for (const rule of LINK_RULES) {
      // YouTube reuses cards, so a previous Shorts link may now be a normal video.
      if (root instanceof Element) {
        root.removeAttribute(rule.attribute);
      }
      for (const markedElement of root.querySelectorAll(`[${rule.attribute}]`)) {
        markedElement.removeAttribute(rule.attribute);
      }

      if (!settings[rule.setting]) continue;

      if (root instanceof Element && root.matches(rule.selector)) {
        markLink(root, rule);
      }

      for (const link of root.querySelectorAll(rule.selector)) {
        markLink(link, rule);
      }
    }
  }

  function flushPendingRoots() {
    animationFrameId = 0;

    if (location.href !== previousUrl) {
      previousUrl = location.href;
      setRouteClasses();
    }

    if (settings.enabled) {
      for (const root of pendingRoots) {
        updateMarkedLinks(root);
      }
    }

    pendingRoots.clear();
  }

  function scheduleProcessing(node) {
    if (node instanceof Element) {
      pendingRoots.add(node.closest(CARD_SELECTOR) || node);
    }

    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(flushPendingRoots);
    }
  }

  function handleNavigation() {
    previousUrl = location.href;
    setRouteClasses();

    if (settings.enabled) {
      updateMarkedLinks(document);
    }
  }

  function startObserver() {
    if (mutationObserver || !document.documentElement) return;

    mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        scheduleProcessing(record.target);
        for (const node of record.addedNodes) {
          scheduleProcessing(node);
        }
      }

      if (location.href !== previousUrl && !animationFrameId) {
        animationFrameId = requestAnimationFrame(flushPendingRoots);
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"]
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) {
      applySettings(changes.settings.newValue);
    }
  });

  window.addEventListener("yt-navigate-finish", handleNavigation);
  window.addEventListener("popstate", handleNavigation);

  settingsApi.getSettings()
    .then((savedSettings) => {
      applySettings(savedSettings);
      startObserver();
    })
    .catch((error) => {
      console.error("BareWatch could not read its settings.", error);
      applySettings(settingsApi.DEFAULT_SETTINGS);
      startObserver();
    });
})();
