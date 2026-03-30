# anyWebMCP User Guide (V3.4)

anyWebMCP is a powerful Chrome extension designed to transform any web page into an AI-callable **WebMCP Tool**. By automating form filling, simulating clicks, and intelligently scraping content, it "grows" structured WebMCP interfaces for web pages that originally lacked an API.

---

## Core Execution Architecture: Dual-Track

anyWebMCP employs a unique execution routing mechanism to ensure optimal performance and stability across different types of web pages.

### 1. Local Track
*   **Use Case**: Single Page Applications (SPA) or pages with partial updates.
*   **Configuration**: Check **"SPA - Results appear on current page"**.
*   **Logic**: Execution requests are handled directly within the current page's Content Script.
*   **Advantage**: Ultra-fast response with zero background overhead.

### 2. Managed Track
*   **Use Case**: Traditional multi-page navigation or remote cross-page control.
*   **Configuration**: Uncheck **"SPA - Results appear on current page"**.
*   **Logic**: Execution is handed off to the extension Background script, which monitors page navigation and dispatches subsequent instructions.
*   **Advantage**: Leverages background persistence to perfectly support automation flows involving page refreshes.

---

## ⚠️ Important Rules: Cross-Page Call Limitations

Due to browser page lifecycle constraints, please adhere to the following rules:

### Rule 1: Page Navigation Causes Local Promise Loss
If you run `await navigator.modelContext.executeTool(...)` directly in a page console and the tool does NOT have "SPA mode" enabled (i.e., it navigates after clicking):
*   **Result**: After the page refreshes, the original execution context is destroyed. The `await` in the console will be interrupted immediately, and you **cannot** retrieve the result in the current console.
*   **Background Behavior**: Although the console connection is lost, anyWebMCP background will still complete the task and scrape the results.

### Rule 2: Recommended to use Options Console for Navigation Tests
For tasks involving page navigation, **it is recommended to initiate calls from the Options page console**:
*   **Operation**: Open Options page -> F12 Console -> Send `ANYWEBMCP_EXECUTE_REQUEST` message.
*   **Effect**: Since the Options page does not refresh, it can stably wait for the background to complete cross-page scraping and receive the final returned result.

---

## Configuration Details

### 1. Target
*   **Entry URL**: The entry point for the tool. If a matching page is not currently open, the background can automatically open this URL.
*   **URL Pattern**: Matching pattern (e.g., `*://example.com/*`). Determines which pages the tool is active on.

### 2. Execution
*   **Submit Button Selector**: Selector for the button that triggers the action (e.g., `button#search`).
*   **SPA - Results appear on current page**: 
    *   **Checked (Default)**: Suitable for results loaded via Ajax or dynamically displayed on the current page.
    *   **Unchecked**: Suitable for cases where clicking triggers a full page refresh (URL change).

### 3. Tool Definition (API Spec)
*   **Tool Name**: Unique identifier for AI recognition (letters, numbers, underscores only).
*   **Description**: Explain the tool's purpose to the AI.
*   **Read-Only Hint**: When checked, the AI will assume this operation does not change server state.
*   **Inputs**: Define parameters and their corresponding webpage input selectors.

### 4. Output Configuration
*   **Output Mode**:
    *   **Static (Direct)**: Direct scraping. Works with **Delay (ms)** (suggested ≥ 500ms) to wait for rendering.
    *   **Observer (Async)**: Smart monitoring. Captures content as soon as it appears in the DOM, offering the fastest response.
    *   **Custom Script**: Runs custom JS in the page context. Supports Promises, ideal for complex logic.
*   **Extraction Strategy**:
    *   **First Match**: Scrapes the first occurrence.
    *   **Last Match**: Scrapes the last occurrence (ideal for chat logs, dynamic lists).
    *   **Combine All Text**: Merges text from all matching elements.
    *   **Get Attribute Value**: Scrapes a specific attribute (e.g., `href`, `src`); requires an attribute name.

---

## Debugging and Safety

*   **Dynamic Title Counter**: Numbers ①-⑳ appear before the page title, representing the count of **truly available** tools on the current page.
*   **Manual Call Helper**: `await anywebmcp_manualCall('name', params)`.
*   **Namespace Protection**: All internal communications use the `ANYWEBMCP_` prefix to ensure zero interference with other scripts.

---

## Developer Advice: Writing Custom Scripts
Custom Scripts execute in the Main World context and have full access to `window` and `document`:
```javascript
// Example: Monitoring streaming output and waiting for a completion button
return new Promise((resolve) => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.done-btn');
    if (btn) {
      obs.disconnect();
      resolve(document.querySelector('.content').innerText);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
```
