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

  // src/scripts/inject.ts
  var TAG = "[anyWebMCP]";
  var CIRCLED_NUMS = ["\u24EA", "\u2460", "\u2461", "\u2462", "\u2463", "\u2464", "\u2465", "\u2466", "\u2467", "\u2468", "\u2469", "\u246A", "\u246B", "\u246C", "\u246D", "\u246E", "\u246F", "\u2470", "\u2471", "\u2472", "\u2473"];
  (function() {
    let titleObserver = null;
    let elementObserver = null;
    let isUpdatingTitle = false;
    let rawConfigs = [];
    let registeredToolNames = /* @__PURE__ */ new Set();
    let refreshTimer = null;
    function getCleanTitle(title) {
      let clean = title.replace(/^\(\d+\)\s+/, "");
      const pattern = new RegExp(`^[${CIRCLED_NUMS.join("")}]\\s+`);
      return clean.replace(pattern, "");
    }
    function updateTitle() {
      if (isUpdatingTitle) return;
      const count = window.__ANYWEBMCP_INTERCEPTORS__?.size || 0;
      const currentTitle = document.title;
      const cleanTitle = getCleanTitle(currentTitle);
      let newTitle = cleanTitle;
      if (count > 0) {
        const prefix = count <= 20 ? CIRCLED_NUMS[count] : `(${count})`;
        newTitle = `${prefix} ${cleanTitle}`;
      }
      if (newTitle !== currentTitle) {
        isUpdatingTitle = true;
        document.title = newTitle;
        setTimeout(() => {
          isUpdatingTitle = false;
        }, 0);
      }
    }
    function initTitleObserver() {
      const titleEl = document.querySelector("title");
      if (titleEl && !titleObserver) {
        titleObserver = new MutationObserver(() => updateTitle());
        titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    }
    function debouncedRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshRegistrations, 300);
    }
    function refreshRegistrations() {
      const nav = navigator;
      if (!nav.modelContext) return;
      const currentUsableConfigs = rawConfigs.filter((config) => {
        const hasSubmit = !!document.querySelector(config.submit.selector);
        const hasInputs = config.inputs.every((input) => !!document.querySelector(input.selector));
        return hasSubmit && hasInputs;
      });
      const usableNames = new Set(currentUsableConfigs.map((c) => c.toolName));
      registeredToolNames.forEach((name) => {
        if (!usableNames.has(name)) {
          console.log(`${TAG} Elements disappeared, unregistering: ${name}`);
          try {
            nav.modelContext.unregisterTool(name);
          } catch (e) {
          }
          registeredToolNames.delete(name);
        }
      });
      currentUsableConfigs.forEach((config) => {
        if (!registeredToolNames.has(config.toolName)) {
          console.log(`${TAG} Elements found, registering: ${config.toolName}`);
          const inputSchema = {
            type: "object",
            properties: config.inputs.reduce((acc, input) => {
              acc[input.name] = { type: "string", description: input.description };
              return acc;
            }, {}),
            required: config.inputs.map((i) => i.name)
          };
          try {
            nav.modelContext.registerTool({
              name: config.toolName,
              description: config.description,
              inputSchema,
              annotations: config.annotations,
              execute: (input) => nav.modelContext.executeTool(config.toolName, input)
            });
            registeredToolNames.add(config.toolName);
          } catch (e) {
            console.error(`${TAG} Registration failed for ${config.toolName}`, e);
          }
        }
      });
    }
    function initHijack() {
      const nav = navigator;
      if (!nav.modelContext) {
        if (document.readyState !== "complete") setTimeout(initHijack, 50);
        return;
      }
      const mc = nav.modelContext;
      if (mc.__ANYWEBMCP_HIJACKED__) return;
      mc.__ANYWEBMCP_HIJACKED__ = true;
      const originalRegister = mc.registerTool.bind(mc);
      const originalUnregister = mc.unregisterTool?.bind(mc);
      const originalExecuteTool = mc.executeTool?.bind(mc);
      window.__ANYWEBMCP_INTERCEPTORS__ = /* @__PURE__ */ new Map();
      mc.registerTool = function(toolConfig) {
        window.__ANYWEBMCP_INTERCEPTORS__.set(toolConfig.name, toolConfig);
        updateTitle();
        return originalRegister(toolConfig);
      };
      if (originalUnregister) {
        mc.unregisterTool = function(name) {
          window.__ANYWEBMCP_INTERCEPTORS__.delete(name);
          updateTitle();
          return originalUnregister(name);
        };
      }
      mc.executeTool = async function(name, params) {
        const config = rawConfigs.find((c) => c.toolName === name);
        if (config) {
          console.log(`${TAG} Intercepted execution: ${name}`);
          return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).slice(2);
            const listener = (event) => {
              if (event.source !== window || !event.data || event.data.from !== ANYWEBMCP_SOURCES.CONTENT) return;
              const msg = event.data;
              if (msg.type === ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE && msg.payload.id === requestId) {
                window.removeEventListener("message", listener);
                if (msg.payload.error) reject(new Error(msg.payload.error.message));
                else resolve(msg.payload.result);
              }
            };
            window.addEventListener("message", listener);
            window.postMessage({
              type: ANYWEBMCP_MSG_TYPES.EXECUTE_REQUEST,
              payload: { jsonrpc: "2.0", method: name, params, id: requestId },
              from: ANYWEBMCP_SOURCES.INJECTED
            }, "*");
          });
        }
        if (originalExecuteTool) return originalExecuteTool(name, params);
        const localTool = window.__ANYWEBMCP_INTERCEPTORS__?.get(name);
        if (localTool) return localTool.execute(params);
        throw new Error(`Tool ${name} not found.`);
      };
      window.anywebmcp_manualCall = (name, params) => nav.modelContext.executeTool(name, params);
      initTitleObserver();
      if (!elementObserver) {
        elementObserver = new MutationObserver(debouncedRefresh);
        elementObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      console.log(`${TAG} Unified executeTool hijack ready.`);
    }
    window.addEventListener("message", (event) => {
      if (event.source !== window || !event.data || event.data.from !== ANYWEBMCP_SOURCES.CONTENT) return;
      if (event.data.type === ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED) {
        rawConfigs = event.data.configs;
        debouncedRefresh();
      }
      if (event.data.type === ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_REQUEST) {
        const { script, requestId } = event.data;
        try {
          const execFunc = new Function("document", "window", `return (async () => { ${script} })()`);
          const resultPromise = execFunc(document, window);
          Promise.resolve(resultPromise).then((result) => {
            window.postMessage({ type: ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_RESPONSE, requestId, result, from: ANYWEBMCP_SOURCES.INJECTED }, "*");
          }).catch((err) => {
            window.postMessage({ type: ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_RESPONSE, requestId, error: err.message, from: ANYWEBMCP_SOURCES.INJECTED }, "*");
          });
        } catch (e) {
          window.postMessage({ type: ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_RESPONSE, requestId, error: e.message, from: ANYWEBMCP_SOURCES.INJECTED }, "*");
        }
      }
    });
    initHijack();
    window.postMessage({ type: ANYWEBMCP_MSG_TYPES.REQUEST_CONFIGS, from: ANYWEBMCP_SOURCES.INJECTED }, "*");
    setInterval(debouncedRefresh, 5e3);
    setInterval(() => {
      if (navigator.modelContext && !navigator.modelContext.__ANYWEBMCP_HIJACKED__) initHijack();
    }, 1e3);
  })();
})();
