import { getAppState, saveConfig, deleteConfig, exportConfigs, importConfigs, validateConfig } from '../lib/storage.js';
import { WebMcpConfig, ToolInput, SelectorStrategy } from '../lib/types.js';

// DOM Elements
const configList = document.getElementById('config-list')!;
const searchBox = document.getElementById('search-box') as HTMLInputElement;

const appLogo = document.getElementById('app-logo') as HTMLImageElement;
if (appLogo) {
  appLogo.onerror = () => { appLogo.style.display = 'none'; };
}

const welcomeState = document.getElementById('welcome-state')!;
const editorContainer = document.getElementById('editor-container')!;
const editorTitle = document.getElementById('editor-title')!;
const configForm = document.getElementById('config-form') as HTMLFormElement;
const inputsContainer = document.getElementById('inputs-container')!;

const addBtn = document.getElementById('add-config-btn')!;
const deleteBtn = document.getElementById('delete-btn')!;
const addInputBtn = document.getElementById('add-input-btn')!;
const exportBtn = document.getElementById('export-btn')!;
const importBtn = document.getElementById('import-btn')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

// Form Fields
const fieldId = document.getElementById('config-id') as HTMLInputElement;
const fieldEntryUrl = document.getElementById('entry-url') as HTMLInputElement;
const btnTestEntry = document.getElementById('test-entry-btn') as HTMLButtonElement;
const btnShowSchema = document.getElementById('show-schema-btn') as HTMLButtonElement;

// Dialog Elements
const schemaDialog = document.getElementById('schema-dialog') as HTMLDialogElement;
const schemaCode = document.getElementById('schema-code') as HTMLElement;
const btnCloseDialog = document.getElementById('close-dialog-btn') as HTMLButtonElement;
const btnCopySchema = document.getElementById('copy-schema-btn') as HTMLButtonElement;


const fieldUrl = document.getElementById('url-pattern') as HTMLInputElement;
const fieldName = document.getElementById('tool-name') as HTMLInputElement;
const fieldDesc = document.getElementById('description') as HTMLTextAreaElement;
const fieldReadOnly = document.getElementById('readonly-hint') as HTMLInputElement;

const fieldSubmitSel = document.getElementById('submit-selector') as HTMLInputElement;
const fieldSubmitDelay = document.getElementById('submit-delay') as HTMLInputElement;
const fieldSpaMode = document.getElementById('spa-mode') as HTMLInputElement;

// Output Fields
const fieldOutputSel = document.getElementById('output-selector') as HTMLInputElement;
const fieldOutputMode = document.getElementById('output-mode') as HTMLSelectElement;
const fieldTriggerSel = document.getElementById('trigger-selector') as HTMLInputElement;
const fieldSelectorStrategy = document.getElementById('selector-strategy') as HTMLSelectElement;
const fieldAttributeName = document.getElementById('attribute-name') as HTMLInputElement;
const fieldCustomScript = document.getElementById('custom-script') as HTMLTextAreaElement;

// Groups
const groupSelector = document.getElementById('selector-group')!;
const groupTrigger = document.getElementById('trigger-group')!;
const groupStrategyOptions = document.getElementById('strategy-options')!;
const groupCustomScript = document.getElementById('custom-script-group')!;
const groupDelay = document.getElementById('delay-group')!;

// State
let allConfigs: WebMcpConfig[] = [];
let selectedId: string | null = null;

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
    if (url) window.open(url, '_blank');
    else alert('Please enter a valid Entry URL first.');
  };

  btnShowSchema.onclick = () => {
    const inputs: ToolInput[] = Array.from(document.querySelectorAll('.input-row')).map(row => ({
      name: (row.querySelector('.in-name') as HTMLInputElement).value.trim(),
      selector: '',
      description: (row.querySelector('.in-desc') as HTMLInputElement).value.trim()
    }));

    const inputSchema = {
      type: 'object',
      properties: inputs.reduce((acc: any, input) => {
        acc[input.name] = { type: 'string', description: input.description };
        return acc;
      }, {}),
      required: inputs.map(i => i.name)
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
    const text = schemaCode.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const originalText = btnCopySchema.textContent;
      btnCopySchema.textContent = 'Copied!';
      setTimeout(() => { btnCopySchema.textContent = originalText; }, 1500);
    });
  };
}

function updateOutputUI() {
  const mode = fieldOutputMode.value;
  const strategy = fieldSelectorStrategy.value;

  if (mode === 'custom_script') {
    if (groupCustomScript) groupCustomScript.style.display = 'block';
    if (groupSelector) groupSelector.style.display = 'none';
    if (groupTrigger) groupTrigger.style.display = 'none';
    if (groupStrategyOptions) groupStrategyOptions.style.display = 'none';
    fieldOutputSel.required = false;
  } else {
    if (groupCustomScript) groupCustomScript.style.display = 'none';
    if (groupSelector) groupSelector.style.display = 'block';
    if (groupStrategyOptions) groupStrategyOptions.style.display = 'block';
    
    // Trigger only makes sense in Observer mode
    if (groupTrigger) {
      groupTrigger.style.display = mode === 'observer' ? 'block' : 'none';
    }

    fieldOutputSel.required = true;

    if (strategy === 'attribute') {
      fieldAttributeName.style.display = 'block';
      fieldAttributeName.required = true;
    } else {
      fieldAttributeName.style.display = 'none';
      fieldAttributeName.required = false;
    }
  }

  if (groupDelay) {
    if (mode === 'static') {
      groupDelay.style.display = 'block';
      const label = groupDelay.querySelector('label');
      if (label) {
        label.textContent = 'Delay (ms) *';
        label.style.color = '#d32f2f';
      }
    } else {
      groupDelay.style.display = 'none'; 
    }
  }
}

async function loadConfigs() {
  const state = await getAppState();
  allConfigs = state.configs;
}

function renderList(filterText = '') {
  configList.innerHTML = '';
  const filtered = allConfigs.filter(c => 
    c.toolName.toLowerCase().includes(filterText.toLowerCase()) || 
    c.urlPattern.toLowerCase().includes(filterText.toLowerCase())
  );
  if (filtered.length === 0) {
    configList.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">No tools found.</p>';
    return;
  }
  filtered.forEach(config => {
    const item = document.createElement('div');
    item.className = `nav-item ${config.id === selectedId ? 'active' : ''}`;
    const h3 = document.createElement('h3'); h3.textContent = config.toolName;
    const p = document.createElement('p'); p.textContent = config.urlPattern;
    item.appendChild(h3); item.appendChild(p);
    item.onclick = () => selectConfig(config);
    configList.appendChild(item);
  });
}

function selectConfig(config: WebMcpConfig) {
  selectedId = config.id;
  renderList(searchBox.value); 
  showEditor(config);
}

function handleNewTool() {
  selectedId = null;
  renderList(searchBox.value); 
  showEditor(); 
}

function showEditor(config?: WebMcpConfig) {
  welcomeState.classList.add('hidden');
  editorContainer.classList.add('visible');
  if (config) {
    editorTitle.textContent = 'Edit Configuration';
    deleteBtn.style.display = 'block';
    fieldId.value = config.id;
    fieldEntryUrl.value = config.entryUrl || '';
    fieldUrl.value = config.urlPattern;
    fieldName.value = config.toolName;
    fieldDesc.value = config.description;
    fieldReadOnly.checked = !!config.annotations?.readOnlyHint;
    fieldSubmitSel.value = config.submit.selector;
    fieldSubmitDelay.value = config.submit.delay.toString();
    fieldSpaMode.checked = !config.submit.waitForNavigation;
    fieldOutputSel.value = config.output.selector || '';
    fieldOutputMode.value = config.output.mode;
    fieldTriggerSel.value = config.output.triggerSelector || '';
    fieldSelectorStrategy.value = config.output.strategy || 'first';
    fieldAttributeName.value = config.output.attributeName || '';
    fieldCustomScript.value = config.output.customScript || '';
    inputsContainer.innerHTML = '';
    config.inputs.forEach(addInputRow);
  } else {
    editorTitle.textContent = 'New Configuration';
    deleteBtn.style.display = 'none';
    configForm.reset();
    fieldId.value = '';
    fieldEntryUrl.value = '';
    fieldSpaMode.checked = true;
    fieldSelectorStrategy.value = 'first'; 
    fieldOutputMode.value = 'observer';
    fieldSubmitDelay.value = '0';
    fieldTriggerSel.value = '';
    inputsContainer.innerHTML = '';
    addInputRow(); 
  }
  updateOutputUI();
}

function addInputRow(input?: ToolInput) {
  const row = document.createElement('div');
  row.className = 'input-row';
  const createIn = (cls: string, ph: string, req = false, val = '') => {
    const i = document.createElement('input');
    i.className = cls; i.placeholder = ph; i.required = req; i.value = val;
    return i;
  };
  row.appendChild(createIn('in-name', 'Param Name', true, input?.name));
  row.appendChild(createIn('in-selector', 'Selector', true, input?.selector));
  row.appendChild(createIn('in-desc', 'Description', false, input?.description));
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.innerHTML = '&times;';
  removeBtn.style.cssText = 'color:#d32f2f; background:none; border:none; cursor:pointer; font-size:20px; padding:0 5px;';
  removeBtn.onclick = () => row.remove();
  row.appendChild(removeBtn);
  inputsContainer.appendChild(row);
}

async function handleSave(e: Event) {
  e.preventDefault();
  const id = fieldId.value || crypto.randomUUID();
  const inputs: ToolInput[] = Array.from(document.querySelectorAll('.input-row')).map(row => ({
    name: (row.querySelector('.in-name') as HTMLInputElement).value.trim(),
    selector: (row.querySelector('.in-selector') as HTMLInputElement).value.trim(),
    description: (row.querySelector('.in-desc') as HTMLInputElement).value.trim()
  }));
  const outputMode = fieldOutputMode.value as 'observer' | 'static' | 'custom_script';
  const delayVal = parseInt(fieldSubmitDelay.value) || 0;
  if (outputMode === 'static' && delayVal < 500) {
    alert("For 'Static' mode, delay must be at least 500ms."); return;
  }
  const config: WebMcpConfig = {
    id, entryUrl: fieldEntryUrl.value.trim(), urlPattern: fieldUrl.value.trim(),
    toolName: fieldName.value.trim(), description: fieldDesc.value.trim(), inputs,
    submit: { selector: fieldSubmitSel.value.trim(), delay: delayVal, waitForNavigation: !fieldSpaMode.checked },
    output: {
      selector: fieldOutputSel.value.trim(), mode: outputMode, triggerSelector: fieldTriggerSel.value.trim(),
      strategy: fieldSelectorStrategy.value as SelectorStrategy, attributeName: fieldAttributeName.value.trim(),
      customScript: fieldCustomScript.value.trim(), timeout: 5000
    },
    annotations: { readOnlyHint: fieldReadOnly.checked }, enabled: true
  };
  const errors = validateConfig(config);
  if (errors.length > 0) { alert("Please fix errors:\n" + errors.join("\n")); return; }
  try {
    await saveConfig(config); selectedId = id; await loadConfigs(); renderList(searchBox.value);
    const btn = configForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    const oldTxt = btn.textContent; btn.textContent = 'Saved!'; btn.style.background = '#4CAF50';
    setTimeout(() => { btn.textContent = oldTxt; btn.style.background = ''; }, 1500);
    deleteBtn.style.display = 'block'; fieldId.value = id;
  } catch (err: any) { alert("Error: " + err.message); }
}

async function handleDelete() {
  if (!selectedId) return;
  const config = allConfigs.find(c => c.id === selectedId);
  if (config && confirm(`Are you sure you want to delete "${config.toolName}"?`)) {
    await deleteConfig(selectedId); selectedId = null; await loadConfigs(); renderList(searchBox.value);
    welcomeState.classList.remove('hidden'); editorContainer.classList.remove('visible');
  }
}

async function handleExport() {
  const json = await exportConfigs();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url;
  a.download = `anywebmcp_export_${new Date().toISOString().slice(0,10)}.json`; a.click();
}

async function handleImport() {
  if (fileInput.files && fileInput.files[0]) {
    try {
      const res = await importConfigs(await fileInput.files[0].text());
      await loadConfigs(); renderList(searchBox.value);
      alert(`Import successful! Added: ${res.added}, Updated: ${res.updated}`);
    } catch (e: any) { alert("Import failed: " + e.message); }
    fileInput.value = '';
  }
}

init();
