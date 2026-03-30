import { getAppState, setGlobalEnabled } from '../lib/storage.js';

const toggle = document.getElementById('global-toggle') as HTMLInputElement;
const statusDiv = document.getElementById('page-status') as HTMLDivElement;
const optionsBtn = document.getElementById('open-options') as HTMLButtonElement;

async function init() {
  const state = await getAppState();
  toggle.checked = state.globalEnabled;

  toggle.addEventListener('change', async () => {
    await setGlobalEnabled(toggle.checked);
  });

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Check current tab status
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    const matched = state.configs.filter(c => {
      const regex = new RegExp(c.urlPattern.replace(/\*/g, '.*'));
      return regex.test(tab.url!);
    });

    if (matched.length > 0) {
      statusDiv.textContent = `Matched ${matched.length} tool(s)`;
      statusDiv.style.color = 'green';
    } else {
      statusDiv.textContent = 'No tools matched for this page';
    }
  }
}

init();
