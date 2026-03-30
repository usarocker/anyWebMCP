"use strict";
(() => {
  // src/lib/storage.ts
  var DEFAULT_STATE = {
    globalEnabled: true,
    configs: []
  };
  async function getAppState() {
    const data = await chrome.storage.local.get(["globalEnabled", "configs"]);
    return {
      globalEnabled: data.globalEnabled ?? DEFAULT_STATE.globalEnabled,
      configs: data.configs ?? DEFAULT_STATE.configs
    };
  }
  async function setGlobalEnabled(enabled) {
    await chrome.storage.local.set({ globalEnabled: enabled });
  }

  // src/popup/popup.ts
  var toggle = document.getElementById("global-toggle");
  var statusDiv = document.getElementById("page-status");
  var optionsBtn = document.getElementById("open-options");
  async function init() {
    const state = await getAppState();
    toggle.checked = state.globalEnabled;
    toggle.addEventListener("change", async () => {
      await setGlobalEnabled(toggle.checked);
    });
    optionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const matched = state.configs.filter((c) => {
        const regex = new RegExp(c.urlPattern.replace(/\*/g, ".*"));
        return regex.test(tab.url);
      });
      if (matched.length > 0) {
        statusDiv.textContent = `Matched ${matched.length} tool(s)`;
        statusDiv.style.color = "green";
      } else {
        statusDiv.textContent = "No tools matched for this page";
      }
    }
  }
  init();
})();
