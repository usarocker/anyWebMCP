import { WebMcpBridgeMessage, WebMcpConfig, ANYWEBMCP_MSG_TYPES, ANYWEBMCP_SOURCES, ToolResponse } from "../lib/types.js";
import { fillInputs, submitForm, scrapeOutput } from "../lib/dom_utils.js";
import { getAppState } from "../lib/storage.js";

/**
 * anyWebMCP Content Script - Dual Track Executor with Namespace Protection.
 */

let activeConfigs: WebMcpConfig[] = [];

async function syncConfigs() {
  const state = await getAppState();
  if (state.globalEnabled) {
    const newConfigs = state.configs.filter(c => {
      // Escape special characters but allow * to be a wildcard
      const pattern = c.urlPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*/g, '.*');               // Convert * to .*
      const regex = new RegExp(`^${pattern}$`, 'i');
      return regex.test(window.location.href);
    });
    activeConfigs = newConfigs;
    window.postMessage({ type: ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED, configs: activeConfigs, from: ANYWEBMCP_SOURCES.CONTENT }, '*');
  }
}

function injectHijackScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dist/scripts/inject.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Helper to execute custom script via Main World
function executeCustomScript(script: string, requestId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window || !event.data || event.data.from !== ANYWEBMCP_SOURCES.INJECTED) return;
      const msg = event.data as WebMcpBridgeMessage;
      
      if (msg.type === ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_RESPONSE && msg.requestId === requestId) {
        window.removeEventListener('message', listener);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg.result);
      }
    };
    window.addEventListener('message', listener);
    
    window.postMessage({
      type: ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_REQUEST,
      script,
      requestId,
      from: ANYWEBMCP_SOURCES.CONTENT
    }, '*');
  });
}

// --- 1. First-level Router: Handle requests from Inject.ts ---
window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || event.data.from !== ANYWEBMCP_SOURCES.INJECTED) return;

  const msg = event.data as WebMcpBridgeMessage;
  
  if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_REQUEST) {
    const { method, params, id } = msg.payload;
    const config = activeConfigs.find(c => c.toolName === method);

    // [Local Track]: SPA Mode
    if (config && !config.submit.waitForNavigation) {
      console.log(`[anyWebMCP] Executing locally (SPA Mode): ${method}`);
      const startTime = Date.now();
      try {
        await fillInputs(config.inputs, params);
        await new Promise(r => setTimeout(r, 500)); 
        await submitForm(config.submit);
        
        let rawResult;
        if (config.output.mode === 'custom_script' && config.output.customScript) {
          rawResult = await executeCustomScript(config.output.customScript, id.toString());
        } else {
          rawResult = await scrapeOutput(config.output);
        }

        // Standardized MCP Response
        const toolResult: ToolResponse = {
          content: [{ type: "text", text: typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult) }],
          meta: { runtime_ms: Date.now() - startTime }
        };
        
        window.postMessage({
          type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
          payload: { jsonrpc: '2.0', result: toolResult, id },
          from: ANYWEBMCP_SOURCES.CONTENT
        }, '*');
      } catch (error: any) {
        const errorResult: ToolResponse = {
          content: [{ type: "text", text: error.message }],
          isError: true,
          meta: { runtime_ms: Date.now() - startTime }
        };
        window.postMessage({
          type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
          payload: { jsonrpc: '2.0', result: errorResult, id },
          from: ANYWEBMCP_SOURCES.CONTENT
        }, '*');
      }
    } else {
      // [Managed Track]: Hand off to background
      chrome.runtime.sendMessage(msg);
    }
  }

  if (msg.type === ANYWEBMCP_MSG_TYPES.REQUEST_CONFIGS) {
    syncConfigs();
  }
});

// --- 2. Worker: Handle remote commands from Background ---
chrome.runtime.onMessage.addListener((msg: WebMcpBridgeMessage, sender, sendResponse) => {
  if (msg.type === ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND) {
    const { command, config, params, requestId } = msg;

    (async () => {
      try {
        if (command === 'FILL_AND_SUBMIT') {
          if (params) await fillInputs(config.inputs, params);
          await new Promise(r => setTimeout(r, 500));
          await submitForm(config.submit);
          sendResponse({ success: true });
        } else if (command === 'SCRAPE_ONLY') {
          let rawResult;
          if (config.output.mode === 'custom_script' && config.output.customScript) {
            rawResult = await executeCustomScript(config.output.customScript, requestId);
          } else {
            rawResult = await scrapeOutput(config.output);
          }
          
          // Note: Runtime metadata for Managed Track is handled in background.ts
          const toolResult: ToolResponse = {
            content: [{ type: "text", text: typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult) }]
          };

          chrome.runtime.sendMessage({
            type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
            payload: { jsonrpc: '2.0', result: toolResult, id: requestId },
            from: ANYWEBMCP_SOURCES.CONTENT
          });
          sendResponse({ success: true });
        }
      } catch (error: any) {
        const errorResult: ToolResponse = {
          content: [{ type: "text", text: error.message }],
          isError: true
        };
        chrome.runtime.sendMessage({
          type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
          payload: { jsonrpc: '2.0', result: errorResult, id: requestId },
          from: ANYWEBMCP_SOURCES.CONTENT
        });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; 
  }


  // Forward background responses back to local Inject layer
  if (msg.type === ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED) {
    syncConfigs(); // Re-sync and push to Inject
  } else if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE) {
    window.postMessage({ ...msg, from: ANYWEBMCP_SOURCES.CONTENT }, '*');
  }
});

// Init
async function init() {
  const state = await getAppState();
  if (state.globalEnabled) {
    injectHijackScript();
    await syncConfigs();
  }
}

init();
chrome.storage.onChanged.addListener(syncConfigs);
