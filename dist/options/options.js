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
  function validateConfig(config) {
    const errors = [];
    if (!config.urlPattern) errors.push("URL Pattern is required.");
    if (!config.toolName || !/^[a-zA-Z0-9_]+$/.test(config.toolName)) {
      errors.push("Tool Name is required and must be alphanumeric/underscores.");
    }
    if (!config.description) errors.push("Description is required.");
    if (!config.submit.selector) errors.push("Submit selector is required.");
    if (!config.output.selector) errors.push("Output selector is required.");
    if (config.inputs.length === 0) {
      errors.push("At least one input field is required.");
    }
    config.inputs.forEach((input, i) => {
      if (!input.name) errors.push(`Input #${i + 1} name is required.`);
      if (!input.selector) errors.push(`Input #${i + 1} selector is required.`);
    });
    return errors;
  }
  async function saveConfig(config) {
    const state = await getAppState();
    const conflict = state.configs.find((c) => c.toolName === config.toolName && c.id !== config.id);
    if (conflict) {
      throw new Error(`Tool name "${config.toolName}" is already in use.`);
    }
    const index = state.configs.findIndex((c) => c.id === config.id);
    if (index >= 0) {
      state.configs[index] = config;
    } else {
      state.configs.push(config);
    }
    await chrome.storage.local.set({ configs: state.configs });
  }
  async function deleteConfig(id) {
    const state = await getAppState();
    const configs = state.configs.filter((c) => c.id !== id);
    await chrome.storage.local.set({ configs });
  }
  async function exportConfigs() {
    const state = await getAppState();
    return JSON.stringify({
      version: "1.0",
      timestamp: Date.now(),
      configs: state.configs
    }, null, 2);
  }
  async function importConfigs(json) {
    try {
      const data = JSON.parse(json);
      const importedConfigs = Array.isArray(data) ? data : data.configs || [];
      if (!Array.isArray(importedConfigs)) throw new Error("Invalid format: Expected array of configs.");
      const state = await getAppState();
      const currentConfigs = [...state.configs];
      let added = 0;
      let updated = 0;
      for (const config of importedConfigs) {
        if (!config.id || !config.toolName) continue;
        const indexById = currentConfigs.findIndex((c) => c.id === config.id);
        const indexBySemantics = currentConfigs.findIndex((c) => c.toolName === config.toolName && c.urlPattern === config.urlPattern);
        const targetIndex = indexById !== -1 ? indexById : indexBySemantics;
        if (targetIndex >= 0) {
          currentConfigs[targetIndex] = { ...currentConfigs[targetIndex], ...config };
          updated++;
        } else {
          if (currentConfigs.some((c) => c.toolName === config.toolName)) {
            console.warn(`Skipping import of "${config.toolName}" due to name conflict with a different URL.`);
            continue;
          }
          currentConfigs.push(config);
          added++;
        }
      }
      await chrome.storage.local.set({ configs: currentConfigs });
      return { added, updated };
    } catch (e) {
      throw new Error("Import failed: " + e.message);
    }
  }

  // src/options/options.ts
  var configList = document.getElementById("config-list");
  var searchBox = document.getElementById("search-box");
  var appLogo = document.getElementById("app-logo");
  if (appLogo) {
    appLogo.onerror = () => {
      appLogo.style.display = "none";
    };
  }
  var welcomeState = document.getElementById("welcome-state");
  var editorContainer = document.getElementById("editor-container");
  var editorTitle = document.getElementById("editor-title");
  var configForm = document.getElementById("config-form");
  var inputsContainer = document.getElementById("inputs-container");
  var addBtn = document.getElementById("add-config-btn");
  var deleteBtn = document.getElementById("delete-btn");
  var addInputBtn = document.getElementById("add-input-btn");
  var exportBtn = document.getElementById("export-btn");
  var importBtn = document.getElementById("import-btn");
  var fileInput = document.getElementById("file-input");
  var fieldId = document.getElementById("config-id");
  var fieldEntryUrl = document.getElementById("entry-url");
  var btnTestEntry = document.getElementById("test-entry-btn");
  var btnShowSchema = document.getElementById("show-schema-btn");
  var schemaDialog = document.getElementById("schema-dialog");
  var schemaCode = document.getElementById("schema-code");
  var btnCloseDialog = document.getElementById("close-dialog-btn");
  var btnCopySchema = document.getElementById("copy-schema-btn");
  var fieldUrl = document.getElementById("url-pattern");
  var fieldName = document.getElementById("tool-name");
  var fieldDesc = document.getElementById("description");
  var fieldReadOnly = document.getElementById("readonly-hint");
  var fieldSubmitSel = document.getElementById("submit-selector");
  var fieldSubmitDelay = document.getElementById("submit-delay");
  var fieldSpaMode = document.getElementById("spa-mode");
  var fieldOutputSel = document.getElementById("output-selector");
  var fieldOutputMode = document.getElementById("output-mode");
  var fieldTriggerSel = document.getElementById("trigger-selector");
  var fieldSelectorStrategy = document.getElementById("selector-strategy");
  var fieldAttributeName = document.getElementById("attribute-name");
  var fieldCustomScript = document.getElementById("custom-script");
  var groupSelector = document.getElementById("selector-group");
  var groupTrigger = document.getElementById("trigger-group");
  var groupStrategyOptions = document.getElementById("strategy-options");
  var groupCustomScript = document.getElementById("custom-script-group");
  var groupDelay = document.getElementById("delay-group");
  var allConfigs = [];
  var selectedId = null;
  async function init() {
    await loadConfigs();
    renderList();
    addBtn.onclick = handleNewTool;
    searchBox.oninput = () => renderList(searchBox.value);
    configForm.onsubmit = handleSave;
    deleteBtn.onclick = handleDelete;
    addInputBtn.onclick = () => addInputRow();
    exportBtn.onclick = handleExport;
    importBtn.onclick = () => fileInput.click();
    fileInput.onchange = handleImport;
    fieldOutputMode.onchange = updateOutputUI;
    fieldSelectorStrategy.onchange = updateOutputUI;
    btnTestEntry.onclick = () => {
      const url = fieldEntryUrl.value.trim();
      if (url) window.open(url, "_blank");
      else alert("Please enter a valid Entry URL first.");
    };
    btnShowSchema.onclick = () => {
      const inputs = Array.from(document.querySelectorAll(".input-row")).map((row) => ({
        name: row.querySelector(".in-name").value.trim(),
        selector: "",
        description: row.querySelector(".in-desc").value.trim()
      }));
      const inputSchema = {
        type: "object",
        properties: inputs.reduce((acc, input) => {
          acc[input.name] = { type: "string", description: input.description };
          return acc;
        }, {}),
        required: inputs.map((i) => i.name)
      };
      const schemaObj = {
        name: fieldName.value.trim(),
        description: fieldDesc.value.trim(),
        inputSchema,
        annotations: { readOnlyHint: fieldReadOnly.checked }
      };
      schemaCode.textContent = JSON.stringify(schemaObj, null, 2);
      schemaDialog.showModal();
    };
    btnCloseDialog.onclick = () => schemaDialog.close();
    btnCopySchema.onclick = () => {
      const text = schemaCode.textContent || "";
      navigator.clipboard.writeText(text).then(() => {
        const originalText = btnCopySchema.textContent;
        btnCopySchema.textContent = "Copied!";
        setTimeout(() => {
          btnCopySchema.textContent = originalText;
        }, 1500);
      });
    };
  }
  function updateOutputUI() {
    const mode = fieldOutputMode.value;
    const strategy = fieldSelectorStrategy.value;
    if (mode === "custom_script") {
      if (groupCustomScript) groupCustomScript.style.display = "block";
      if (groupSelector) groupSelector.style.display = "none";
      if (groupTrigger) groupTrigger.style.display = "none";
      if (groupStrategyOptions) groupStrategyOptions.style.display = "none";
      fieldOutputSel.required = false;
    } else {
      if (groupCustomScript) groupCustomScript.style.display = "none";
      if (groupSelector) groupSelector.style.display = "block";
      if (groupStrategyOptions) groupStrategyOptions.style.display = "block";
      if (groupTrigger) {
        groupTrigger.style.display = mode === "observer" ? "block" : "none";
      }
      fieldOutputSel.required = true;
      if (strategy === "attribute") {
        fieldAttributeName.style.display = "block";
        fieldAttributeName.required = true;
      } else {
        fieldAttributeName.style.display = "none";
        fieldAttributeName.required = false;
      }
    }
    if (groupDelay) {
      if (mode === "static") {
        groupDelay.style.display = "block";
        const label = groupDelay.querySelector("label");
        if (label) {
          label.textContent = "Delay (ms) *";
          label.style.color = "#d32f2f";
        }
      } else {
        groupDelay.style.display = "none";
      }
    }
  }
  async function loadConfigs() {
    const state = await getAppState();
    allConfigs = state.configs;
  }
  function renderList(filterText = "") {
    configList.innerHTML = "";
    const filtered = allConfigs.filter(
      (c) => c.toolName.toLowerCase().includes(filterText.toLowerCase()) || c.urlPattern.toLowerCase().includes(filterText.toLowerCase())
    );
    if (filtered.length === 0) {
      configList.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">No tools found.</p>';
      return;
    }
    filtered.forEach((config) => {
      const item = document.createElement("div");
      item.className = `nav-item ${config.id === selectedId ? "active" : ""}`;
      const h3 = document.createElement("h3");
      h3.textContent = config.toolName;
      const p = document.createElement("p");
      p.textContent = config.urlPattern;
      item.appendChild(h3);
      item.appendChild(p);
      item.onclick = () => selectConfig(config);
      configList.appendChild(item);
    });
  }
  function selectConfig(config) {
    selectedId = config.id;
    renderList(searchBox.value);
    showEditor(config);
  }
  function handleNewTool() {
    selectedId = null;
    renderList(searchBox.value);
    showEditor();
  }
  function showEditor(config) {
    welcomeState.classList.add("hidden");
    editorContainer.classList.add("visible");
    if (config) {
      editorTitle.textContent = "Edit Configuration";
      deleteBtn.style.display = "block";
      fieldId.value = config.id;
      fieldEntryUrl.value = config.entryUrl || "";
      fieldUrl.value = config.urlPattern;
      fieldName.value = config.toolName;
      fieldDesc.value = config.description;
      fieldReadOnly.checked = !!config.annotations?.readOnlyHint;
      fieldSubmitSel.value = config.submit.selector;
      fieldSubmitDelay.value = config.submit.delay.toString();
      fieldSpaMode.checked = !config.submit.waitForNavigation;
      fieldOutputSel.value = config.output.selector || "";
      fieldOutputMode.value = config.output.mode;
      fieldTriggerSel.value = config.output.triggerSelector || "";
      fieldSelectorStrategy.value = config.output.strategy || "first";
      fieldAttributeName.value = config.output.attributeName || "";
      fieldCustomScript.value = config.output.customScript || "";
      inputsContainer.innerHTML = "";
      config.inputs.forEach(addInputRow);
    } else {
      editorTitle.textContent = "New Configuration";
      deleteBtn.style.display = "none";
      configForm.reset();
      fieldId.value = "";
      fieldEntryUrl.value = "";
      fieldSpaMode.checked = true;
      fieldSelectorStrategy.value = "first";
      fieldOutputMode.value = "observer";
      fieldSubmitDelay.value = "0";
      fieldTriggerSel.value = "";
      inputsContainer.innerHTML = "";
      addInputRow();
    }
    updateOutputUI();
  }
  function addInputRow(input) {
    const row = document.createElement("div");
    row.className = "input-row";
    const createIn = (cls, ph, req = false, val = "") => {
      const i = document.createElement("input");
      i.className = cls;
      i.placeholder = ph;
      i.required = req;
      i.value = val;
      return i;
    };
    row.appendChild(createIn("in-name", "Param Name", true, input?.name));
    row.appendChild(createIn("in-selector", "Selector", true, input?.selector));
    row.appendChild(createIn("in-desc", "Description", false, input?.description));
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.innerHTML = "&times;";
    removeBtn.style.cssText = "color:#d32f2f; background:none; border:none; cursor:pointer; font-size:20px; padding:0 5px;";
    removeBtn.onclick = () => row.remove();
    row.appendChild(removeBtn);
    inputsContainer.appendChild(row);
  }
  async function handleSave(e) {
    e.preventDefault();
    const id = fieldId.value || crypto.randomUUID();
    const inputs = Array.from(document.querySelectorAll(".input-row")).map((row) => ({
      name: row.querySelector(".in-name").value.trim(),
      selector: row.querySelector(".in-selector").value.trim(),
      description: row.querySelector(".in-desc").value.trim()
    }));
    const outputMode = fieldOutputMode.value;
    const delayVal = parseInt(fieldSubmitDelay.value) || 0;
    if (outputMode === "static" && delayVal < 500) {
      alert("\u5BF9\u4E8E 'Static' \u6A21\u5F0F\uFF0C\u5EF6\u8FDF\u5FC5\u987B\u81F3\u5C11\u4E3A 500ms\u3002");
      return;
    }
    const config = {
      id,
      entryUrl: fieldEntryUrl.value.trim(),
      urlPattern: fieldUrl.value.trim(),
      toolName: fieldName.value.trim(),
      description: fieldDesc.value.trim(),
      inputs,
      submit: { selector: fieldSubmitSel.value.trim(), delay: delayVal, waitForNavigation: !fieldSpaMode.checked },
      output: {
        selector: fieldOutputSel.value.trim(),
        mode: outputMode,
        triggerSelector: fieldTriggerSel.value.trim(),
        strategy: fieldSelectorStrategy.value,
        attributeName: fieldAttributeName.value.trim(),
        customScript: fieldCustomScript.value.trim(),
        timeout: 5e3
      },
      annotations: { readOnlyHint: fieldReadOnly.checked },
      enabled: true
    };
    const errors = validateConfig(config);
    if (errors.length > 0) {
      alert("\u8BF7\u4FEE\u6B63\u9519\u8BEF:\n" + errors.join("\n"));
      return;
    }
    try {
      await saveConfig(config);
      selectedId = id;
      await loadConfigs();
      renderList(searchBox.value);
      const btn = configForm.querySelector('button[type="submit"]');
      const oldTxt = btn.textContent;
      btn.textContent = "Saved!";
      btn.style.background = "#4CAF50";
      setTimeout(() => {
        btn.textContent = oldTxt;
        btn.style.background = "";
      }, 1500);
      deleteBtn.style.display = "block";
      fieldId.value = id;
    } catch (err) {
      alert("Error: " + err.message);
    }
  }
  async function handleDelete() {
    if (!selectedId) return;
    const config = allConfigs.find((c) => c.id === selectedId);
    if (config && confirm(`\u786E\u5B9A\u5220\u9664 "${config.toolName}"?`)) {
      await deleteConfig(selectedId);
      selectedId = null;
      await loadConfigs();
      renderList(searchBox.value);
      welcomeState.classList.remove("hidden");
      editorContainer.classList.remove("visible");
    }
  }
  async function handleExport() {
    const json = await exportConfigs();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `anywebmcp_export_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    a.click();
  }
  async function handleImport() {
    if (fileInput.files && fileInput.files[0]) {
      try {
        const res = await importConfigs(await fileInput.files[0].text());
        await loadConfigs();
        renderList(searchBox.value);
        alert(`\u5BFC\u5165\u6210\u529F\uFF01\u65B0\u589E: ${res.added}, \u66F4\u65B0: ${res.updated}`);
      } catch (e) {
        alert("\u5BFC\u5165\u5931\u8D25: " + e.message);
      }
      fileInput.value = "";
    }
  }
  init();
})();
