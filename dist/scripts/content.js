"use strict";
(() => {
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

  // src/lib/dom_utils.ts
  async function fillInputs(inputs, values) {
    for (const input of inputs) {
      const el = document.querySelector(input.selector);
      if (el) {
        const val = values[input.name];
        if (val !== void 0) {
          console.log(`[anyWebMCP] Filling input (Paste mode): ${input.selector}`);
          el.focus();
          const dataTransfer = new DataTransfer();
          dataTransfer.setData("text/plain", val);
          const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
          });
          el.dispatchEvent(pasteEvent);
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.blur();
        }
      }
    }
  }
  async function submitForm(submit) {
    const btn = document.querySelector(submit.selector);
    if (!btn) throw new Error(`Submit button not found: ${submit.selector}`);
    console.log(`[anyWebMCP] Clicking submit button: ${submit.selector}`);
    btn.focus();
    btn.click();
    const delay = submit.delay > 0 ? submit.delay : 0;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  function extractContent(selector, strategy = "first", attributeName) {
    const els = document.querySelectorAll(selector);
    if (els.length === 0) return null;
    if (strategy === "last") {
      const el2 = els[els.length - 1];
      return attributeName ? el2.getAttribute(attributeName) : el2.innerText;
    }
    if (strategy === "all_text") {
      return Array.from(els).map((el2) => attributeName ? el2.getAttribute(attributeName) : el2.innerText).join("\n");
    }
    if (strategy === "attribute") {
      const el2 = els[0];
      return attributeName ? el2.getAttribute(attributeName) : el2.innerText;
    }
    const el = els[0];
    return attributeName ? el.getAttribute(attributeName) : el.innerText;
  }
  async function scrapeOutput(output) {
    console.log(`[anyWebMCP] Starting scrape for: ${output.selector} (Mode: ${output.mode})`);
    if (output.mode === "static") {
      const result = extractContent(output.selector, output.strategy, output.attributeName);
      if (result === null) throw new Error(`Output container not found: ${output.selector}`);
      return result || "";
    }
    return new Promise((resolve, reject) => {
      const existingTriggers = /* @__PURE__ */ new Set();
      if (output.triggerSelector) {
        document.querySelectorAll(output.triggerSelector).forEach((el) => existingTriggers.add(el));
        console.log(`[anyWebMCP] Observer started. Ignoring ${existingTriggers.size} pre-existing triggers.`);
      }
      const checkResult = () => {
        const result = extractContent(output.selector, output.strategy, output.attributeName);
        if (result && typeof result === "string" && result.trim().length > 0) return result.trim();
        return null;
      };
      const finish = () => {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(checkResult() || "");
      };
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        const finalResult = checkResult();
        if (finalResult) resolve(finalResult);
        else reject(new Error(`Timeout waiting for output.`));
      }, output.timeout);
      const observer = new MutationObserver((mutations) => {
        if (output.triggerSelector) {
          const triggers = document.querySelectorAll(output.triggerSelector);
          for (const t of triggers) {
            if (!existingTriggers.has(t)) {
              console.log(`[anyWebMCP] New Trigger element found: ${output.triggerSelector}. Finishing scrape.`);
              finish();
              return;
            }
          }
        } else {
          const result = checkResult();
          if (result) {
            clearTimeout(timeoutId);
            setTimeout(finish, 1e3);
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      if (!output.triggerSelector && checkResult()) {
        setTimeout(finish, 500);
      }
    });
  }

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

  // src/scripts/content.ts
  var activeConfigs = [];
  async function syncConfigs() {
    const state = await getAppState();
    if (state.globalEnabled) {
      const newConfigs = state.configs.filter((c) => {
        const regex = new RegExp(c.urlPattern.replace(/\*/g, ".*"));
        return regex.test(window.location.href);
      });
      activeConfigs = newConfigs;
      window.postMessage({ type: ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED, configs: activeConfigs, from: ANYWEBMCP_SOURCES.CONTENT }, "*");
    }
  }
  function injectHijackScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("dist/scripts/inject.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  function executeCustomScript(script, requestId) {
    return new Promise((resolve, reject) => {
      const listener = (event) => {
        if (event.source !== window || !event.data || event.data.from !== ANYWEBMCP_SOURCES.INJECTED) return;
        const msg = event.data;
        if (msg.type === ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_RESPONSE && msg.requestId === requestId) {
          window.removeEventListener("message", listener);
          if (msg.error) reject(new Error(msg.error));
          else resolve(msg.result);
        }
      };
      window.addEventListener("message", listener);
      window.postMessage({
        type: ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_REQUEST,
        script,
        requestId,
        from: ANYWEBMCP_SOURCES.CONTENT
      }, "*");
    });
  }
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.from !== ANYWEBMCP_SOURCES.INJECTED) return;
    const msg = event.data;
    if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_REQUEST) {
      const { method, params, id } = msg.payload;
      const config = activeConfigs.find((c) => c.toolName === method);
      if (config && !config.submit.waitForNavigation) {
        console.log(`[anyWebMCP] Executing locally (SPA Mode): ${method}`);
        try {
          await fillInputs(config.inputs, params);
          await new Promise((r) => setTimeout(r, 500));
          await submitForm(config.submit);
          let result;
          if (config.output.mode === "custom_script" && config.output.customScript) {
            result = await executeCustomScript(config.output.customScript, id.toString());
          } else {
            result = await scrapeOutput(config.output);
          }
          window.postMessage({
            type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
            payload: { jsonrpc: "2.0", result, id },
            from: ANYWEBMCP_SOURCES.CONTENT
          }, "*");
        } catch (error) {
          window.postMessage({
            type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
            payload: { jsonrpc: "2.0", error: { code: -32e3, message: error.message }, id },
            from: ANYWEBMCP_SOURCES.CONTENT
          }, "*");
        }
      } else {
        chrome.runtime.sendMessage(msg);
      }
    }
    if (msg.type === ANYWEBMCP_MSG_TYPES.REQUEST_CONFIGS) {
      syncConfigs();
    }
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND) {
      const { command, config, params, requestId } = msg;
      (async () => {
        try {
          if (command === "FILL_AND_SUBMIT") {
            if (params) await fillInputs(config.inputs, params);
            await new Promise((r) => setTimeout(r, 500));
            await submitForm(config.submit);
            sendResponse({ success: true });
          } else if (command === "SCRAPE_ONLY") {
            let result;
            if (config.output.mode === "custom_script" && config.output.customScript) {
              result = await executeCustomScript(config.output.customScript, requestId);
            } else {
              result = await scrapeOutput(config.output);
            }
            chrome.runtime.sendMessage({
              type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
              payload: { jsonrpc: "2.0", result, id: requestId },
              from: ANYWEBMCP_SOURCES.CONTENT
            });
            sendResponse({ success: true });
          }
        } catch (error) {
          chrome.runtime.sendMessage({
            type: ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE,
            payload: { jsonrpc: "2.0", error: { code: -32e3, message: error.message }, id: requestId },
            from: ANYWEBMCP_SOURCES.CONTENT
          });
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }
    if (msg.type === ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED) {
      syncConfigs();
    } else if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE) {
      window.postMessage({ ...msg, from: ANYWEBMCP_SOURCES.CONTENT }, "*");
    }
  });
  async function init() {
    const state = await getAppState();
    if (state.globalEnabled) {
      injectHijackScript();
      await syncConfigs();
    }
  }
  init();
  chrome.storage.onChanged.addListener(syncConfigs);
})();
