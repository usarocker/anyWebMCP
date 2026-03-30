import { getAppState } from "../lib/storage.js";
import { BackgroundTask, WebMcpBridgeMessage, WebMcpConfig, ANYWEBMCP_MSG_TYPES, ANYWEBMCP_SOURCES } from "../lib/types.js";

/**
 * anyWebMCP Background Service Worker
 * Orchestrates cross-page automation tasks with Namespace Protection.
 */

const activeTasks = new Map<string, BackgroundTask>();

function matchUrl(url: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(url);
  } catch (e) {
    return false;
  }
}

async function findWorkerTab(config: WebMcpConfig, currentTabId?: number): Promise<number | null> {
  if (currentTabId !== undefined) {
    const tab = await chrome.tabs.get(currentTabId).catch(() => null);
    if (tab?.url && matchUrl(tab.url, config.urlPattern)) return currentTabId;
  }
  const tabs = await chrome.tabs.query({});
  const matched = tabs.find(t => t.url && matchUrl(t.url, config.urlPattern));
  return matched?.id || null;
}

// 1. Listen for Execution Requests
chrome.runtime.onMessage.addListener((msg: WebMcpBridgeMessage, sender, sendResponse) => {
  if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_REQUEST) {
    handleExecutionRequest(msg, sender);
    sendResponse({ status: "processing", taskId: msg.payload.id });
  }

  if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE) {
    const taskId = msg.payload.id.toString();
    const task = activeTasks.get(taskId);
    if (!task) return;

    console.log(`[anyWebMCP] Task ${taskId} completed.`, msg);
    
    // Relay back to caller
    if (task.callerTabId) {
      chrome.tabs.sendMessage(task.callerTabId, msg).catch(() => {});
    }
    
    // Broadcast internally
    chrome.runtime.sendMessage(msg).catch(() => {});

    activeTasks.delete(taskId);
  }
});

async function handleExecutionRequest(msg: any, sender: chrome.runtime.MessageSender) {
  const { method, params, id } = msg.payload;
  const state = await getAppState();
  const config = state.configs.find((c) => c.toolName === method);

  if (!config) return;

  const taskId = id.toString();
  const callerTabId = sender.tab?.id;
  
  try {
    let workerTabId = await findWorkerTab(config, callerTabId);
    let status: any = 'SUBMITTING';

    if (!workerTabId && config.entryUrl) {
      console.log(`[anyWebMCP] Opening: ${config.entryUrl}`);
      const newTab = await chrome.tabs.create({ url: config.entryUrl });
      workerTabId = newTab.id!;
      status = 'WAITING_START';
    }

    if (!workerTabId) throw new Error(`No active tab matches pattern.`);

    const task: BackgroundTask = { id: taskId, config, params, status, callerTabId, workerTabId };
    activeTasks.set(taskId, task);

    if (status === 'SUBMITTING') {
      await executeFillAndSubmit(task);
    }
  } catch (err: any) {
    console.error(`[anyWebMCP] Routing Error:`, err);
    const errorMsg = {
      type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
      payload: { jsonrpc: "2.0", error: { code: -32001, message: err.message }, id: taskId },
      from: ANYWEBMCP_SOURCES.BACKGROUND,
    };
    if (callerTabId) chrome.tabs.sendMessage(callerTabId, errorMsg).catch(() => {});
    chrome.runtime.sendMessage(errorMsg).catch(() => {});
  }
}

async function executeFillAndSubmit(task: BackgroundTask) {
  task.status = 'SUBMITTING';
  try {
    if (task.config.submit.waitForNavigation) {
      chrome.tabs.sendMessage(task.workerTabId!, {
        type: ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND, command: "FILL_AND_SUBMIT",
        config: task.config, params: task.params, requestId: task.id,
        from: ANYWEBMCP_SOURCES.BACKGROUND
      }).catch(() => {});
      task.status = 'WAITING_RESULT';
    } else {
      await chrome.tabs.sendMessage(task.workerTabId!, {
        type: ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND, command: "FILL_AND_SUBMIT",
        config: task.config, params: task.params, requestId: task.id,
        from: ANYWEBMCP_SOURCES.BACKGROUND
      });
      await executeScrape(task);
    }
  } catch (e: any) {
    if (task.config.submit.waitForNavigation) task.status = 'WAITING_RESULT';
    else activeTasks.delete(task.id);
  }
}

async function executeScrape(task: BackgroundTask) {
  task.status = 'SCRAPING';
  try {
    await chrome.tabs.sendMessage(task.workerTabId!, {
      type: ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND, command: "SCRAPE_ONLY",
      config: task.config, requestId: task.id,
      from: ANYWEBMCP_SOURCES.BACKGROUND
    });
  } catch (e) {
    console.error(`[anyWebMCP] Scrape failed:`, e);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Notify Content Script to sync config when URL changes (for SPA routing)
  if (changeInfo.url) {
    chrome.tabs.sendMessage(tabId, { type: ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED }).catch(() => {});
  }

  if (changeInfo.status === "complete") {
    for (const [id, task] of activeTasks.entries()) {
      if (task.workerTabId !== tabId) continue;
      if (task.status === 'WAITING_START') executeFillAndSubmit(task);
      else if (task.status === 'WAITING_RESULT') executeScrape(task);
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("anyWebMCP ready.");
});
