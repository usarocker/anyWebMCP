import { AppState, WebMcpConfig } from './types.js';

const DEFAULT_STATE: AppState = {
  globalEnabled: true,
  configs: []
};

export async function getAppState(): Promise<AppState> {
  const data = await chrome.storage.local.get(['globalEnabled', 'configs']);
  return {
    globalEnabled: data.globalEnabled ?? DEFAULT_STATE.globalEnabled,
    configs: data.configs ?? DEFAULT_STATE.configs
  };
}

export async function setGlobalEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ globalEnabled: enabled });
}

export function validateConfig(config: WebMcpConfig): string[] {
  const errors: string[] = [];
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
    if (!input.name) errors.push(`Input #${i+1} name is required.`);
    if (!input.selector) errors.push(`Input #${i+1} selector is required.`);
  });
  
  return errors;
}

export async function saveConfig(config: WebMcpConfig): Promise<void> {
  const state = await getAppState();
  
  // Check for toolName conflict (excluding current ID)
  const conflict = state.configs.find(c => c.toolName === config.toolName && c.id !== config.id);
  if (conflict) {
    throw new Error(`Tool name "${config.toolName}" is already in use.`);
  }

  const index = state.configs.findIndex(c => c.id === config.id);
  if (index >= 0) {
    state.configs[index] = config;
  } else {
    state.configs.push(config);
  }
  await chrome.storage.local.set({ configs: state.configs });
}

export async function deleteConfig(id: string): Promise<void> {
  const state = await getAppState();
  const configs = state.configs.filter(c => c.id !== id);
  await chrome.storage.local.set({ configs });
}

export async function exportConfigs(): Promise<string> {
  const state = await getAppState();
  return JSON.stringify({
    version: "1.0",
    timestamp: Date.now(),
    configs: state.configs
  }, null, 2);
}

export async function importConfigs(json: string): Promise<{ added: number, updated: number }> {
  try {
    const data = JSON.parse(json);
    const importedConfigs: WebMcpConfig[] = Array.isArray(data) ? data : (data.configs || []);
    
    if (!Array.isArray(importedConfigs)) throw new Error('Invalid format: Expected array of configs.');

    const state = await getAppState();
    const currentConfigs = [...state.configs];
    let added = 0;
    let updated = 0;

    for (const config of importedConfigs) {
      // Basic structure check
      if (!config.id || !config.toolName) continue;

      // 1. Match by ID
      const indexById = currentConfigs.findIndex(c => c.id === config.id);
      // 2. Match by ToolName + URL (Semantically same)
      const indexBySemantics = currentConfigs.findIndex(c => c.toolName === config.toolName && c.urlPattern === config.urlPattern);

      const targetIndex = indexById !== -1 ? indexById : indexBySemantics;

      if (targetIndex >= 0) {
        currentConfigs[targetIndex] = { ...currentConfigs[targetIndex], ...config };
        updated++;
      } else {
        // Double check for Name conflicts before adding a new one
        if (currentConfigs.some(c => c.toolName === config.toolName)) {
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
    throw new Error('Import failed: ' + (e as Error).message);
  }
}
