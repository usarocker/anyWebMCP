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

  // src/lib/types.ts
  var ANYWEBMCP_MSG_TYPES = {
    CONFIG_MATCHED: "ANYWEBMCP_CONFIG_MATCHED",
    EXECUTE_REQUEST: "ANYWEBMCP_EXECUTE_REQUEST",
    EXECUTE_RESPONSE: "ANYWEBMCP_EXECUTE_RESPONSE",
    BG_EXEC_COMMAND: "ANYWEBMCP_BG_EXEC_COMMAND",
    REQUEST_CONFIGS: "ANYWEBMCP_REQUEST_CONFIGS",
    EXEC_SCRIPT_REQUEST: "ANYWEBMCP_EXEC_SCRIPT_REQUEST",
    // 新增：请求执行脚本
    EXEC_SCRIPT_RESPONSE: "ANYWEBMCP_EXEC_SCRIPT_RESPONSE"
    // 新增：脚本执行结果
  };
  var ANYWEBMCP_SOURCES = {
    CONTENT: "ANYWEBMCP_SOURCE_CONTENT",
    INJECTED: "ANYWEBMCP_SOURCE_INJECTED",
    BACKGROUND: "ANYWEBMCP_SOURCE_BACKGROUND"
  };

  // src/scripts/background.ts
  var activeTasks = /* @__PURE__ */ new Map();
  function matchUrl(url, pattern) {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(url);
    } catch (e) {
      return false;
    }
  }
  async function findWorkerTab(config, currentTabId) {
    if (currentTabId !== void 0) {
      const tab = await chrome.tabs.get(currentTabId).catch(() => null);
      if (tab?.url && matchUrl(tab.url, config.urlPattern)) return currentTabId;
    }
    const tabs = await chrome.tabs.query({});
    const matched = tabs.find((t) => t.url && matchUrl(t.url, config.urlPattern));
    return matched?.id || null;
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_REQUEST) {
      handleExecutionRequest(msg, sender);
      sendResponse({ status: "processing", taskId: msg.payload.id });
    }
    if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE) {
      const taskId = msg.payload.id.toString();
      const task = activeTasks.get(taskId);
      if (!task) return;
      console.log(`[anyWebMCP] Task ${taskId} completed.`, msg);
      if (task.callerTabId) {
        chrome.tabs.sendMessage(task.callerTabId, msg).catch(() => {
        });
      }
      chrome.runtime.sendMessage(msg).catch(() => {
      });
      activeTasks.delete(taskId);
    }
  });
  async function handleExecutionRequest(msg, sender) {
    const { method, params, id } = msg.payload;
    const state = await getAppState();
    const config = state.configs.find((c) => c.toolName === method);
    if (!config) return;
    const taskId = id.toString();
    const callerTabId = sender.tab?.id;
    try {
      let workerTabId = await findWorkerTab(config, callerTabId);
      let status = "SUBMITTING";
      if (!workerTabId && config.entryUrl) {
        console.log(`[anyWebMCP] Opening: ${config.entryUrl}`);
        const newTab = await chrome.tabs.create({ url: config.entryUrl });
        workerTabId = newTab.id;
        status = "WAITING_START";
      }
      if (!workerTabId) throw new Error(`No active tab matches pattern.`);
      const task = { id: taskId, config, params, status, callerTabId, workerTabId };
      activeTasks.set(taskId, task);
      if (status === "SUBMITTING") {
        await executeFillAndSubmit(task);
      }
    } catch (err) {
      console.error(`[anyWebMCP] Routing Error:`, err);
      const errorMsg = {
        type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
        payload: { jsonrpc: "2.0", error: { code: -32001, message: err.message }, id: taskId },
        from: ANYWEBMCP_SOURCES.BACKGROUND
      };
      if (callerTabId) chrome.tabs.sendMessage(callerTabId, errorMsg).catch(() => {
      });
      chrome.runtime.sendMessage(errorMsg).catch(() => {
      });
    }
  }
  async function executeFillAndSubmit(task) {
    task.status = "SUBMITTING";
    try {
      if (task.config.submit.waitForNavigation) {
        chrome.tabs.sendMessage(task.workerTabId, {
          type: ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND,
          command: "FILL_AND_SUBMIT",
          config: task.config,
          params: task.params,
          requestId: task.id,
          from: ANYWEBMCP_SOURCES.BACKGROUND
        }).catch(() => {
        });
        task.status = "WAITING_RESULT";
      } else {
        await chrome.tabs.sendMessage(task.workerTabId, {
          type: ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND,
          command: "FILL_AND_SUBMIT",
          config: task.config,
          params: task.params,
          requestId: task.id,
          from: ANYWEBMCP_SOURCES.BACKGROUND
        });
        await executeScrape(task);
      }
    } catch (e) {
      if (task.config.submit.waitForNavigation) task.status = "WAITING_RESULT";
      else activeTasks.delete(task.id);
    }
  }
  async function executeScrape(task) {
    task.status = "SCRAPING";
    try {
      await chrome.tabs.sendMessage(task.workerTabId, {
        type: ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND,
        command: "SCRAPE_ONLY",
        config: task.config,
        requestId: task.id,
        from: ANYWEBMCP_SOURCES.BACKGROUND
      });
    } catch (e) {
      console.error(`[anyWebMCP] Scrape failed:`, e);
    }
  }
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      chrome.tabs.sendMessage(tabId, { type: ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED }).catch(() => {
      });
    }
    if (changeInfo.status === "complete") {
      for (const [id, task] of activeTasks.entries()) {
        if (task.workerTabId !== tabId) continue;
        if (task.status === "WAITING_START") executeFillAndSubmit(task);
        else if (task.status === "WAITING_RESULT") executeScrape(task);
      }
    }
  });
  chrome.runtime.onInstalled.addListener(() => {
    console.log("anyWebMCP ready.");
  });
})();
