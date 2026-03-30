# anyWebMCP 🌐🤖

**Turn Any Web Page into a WebMCP Tool.**

anyWebMCP is a powerful Chrome Extension (Manifest V3) that bridges the gap between AI models and the web. It allows you to transform any website—even those without an API—into a structured **WebMCP Tool** that AI agents can call directly.

By automating form filling, simulating user interactions, and intelligently scraping results, anyWebMCP "grows" an API layer on top of the DOM.

---

## ✨ Key Features

- **Dual-Track Execution**: Optimized routing for Single Page Applications (SPA) and traditional multi-page navigation.
- **Smart DOM Hijacking**: Seamlessly integrates with the `navigator.modelContext` protocol.
- **Intelligent Scraping**:
  - **Observer Mode**: Captures dynamic content (like LLM streaming) as it appears.
  - **Custom Script**: Run your own JavaScript in the page context for complex data extraction.
- **Visual Feedback**: Real-time status indicators (circled numbers ①-⑳) on page titles showing available tools.
- **Namespace Protection**: Isolated communication using `ANYWEBMCP_` prefix to prevent conflicts with page scripts.
- **Import/Export**: Easily share and backup your tool configurations via JSON.

---

## 🚀 Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/anywebmcp.git
   cd anywebmcp
   ```
2. **Install Dependencies**:
   ```bash
   pnpm install
   ```
3. **Build the Extension**:
   ```bash
   pnpm build
   ```
4. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked** and select the `dist` directory (or the project root if your build output is configured differently).

---

## 🛠 Configuration Guide

Access the configuration interface via the extension's **Options Page**. Below is a detailed breakdown of how to set up a new tool.

### 1. Target (Where does the tool live?)

- **Entry URL** _(Optional)_: The starting URL. If the tool is called and no matching page is open, anyWebMCP will automatically open this URL.
- **URL Pattern**: A glob-style pattern (e.g., `*://example.com/search*`) that determines which pages this tool is active on.

### 2. Execution (How is it triggered?)

- **Submit Button Selector**: The CSS selector for the button that triggers the action (e.g., `button[type="submit"]` or `#search-btn`).
- **SPA Mode (Checkbox)**:
  - **Checked**: For Single Page Apps or Ajax-heavy sites where results appear without a full page refresh. (Fastest)
  - **Unchecked**: For traditional websites where clicking "Submit" causes a full page reload or navigation to a new URL.

### 3. Tool Definition (What does the AI see?)

- **Tool Name**: A unique identifier (e.g., `search_products`). Use only letters, numbers, and underscores.
- **Description**: A clear explanation of what the tool does. This is what the AI uses to decide when to call the tool.
- **Read-Only Hint**: Check this if the tool only fetches data and doesn't modify server state.
- **Inputs**: Define the parameters the AI should provide.
  - **Param Name**: The key used in the JSON-RPC call.
  - **Selector**: The CSS selector for the input field (e.g., `input[name="q"]`).

### 4. Output Configuration (How to get the result?)

- **Output Mode**:
  - **Static (Direct)**: Grabs the content immediately after a specified **Delay (ms)**.
  - **Observer (Async)**: Listens for DOM changes. It returns as soon as content appears.
  - **Custom Script**: Execute a snippet of JavaScript to return a value.
- **Container Selector**: The element containing the result you want to extract (e.g., `.result-container`).
- **Trigger Selector** _(Observer Only)_: A specific element that, when it appears, signals the end of a process (e.g., a "Copy" button appearing after an AI finishes writing).
- **Extraction Strategy**:
  - **First Match**: Get the first element matching the selector.
  - **Last Match**: Useful for chat logs or dynamic feeds.
  - **Combine All Text**: Merges text from all matches into one string.
  - **Get Attribute Value**: Extract a specific attribute like `href` or `src`.

---

## 💡 Advanced Usage: Custom Scripts

For complex scenarios, use the **Custom Script** mode. Your script runs in the page's **Main World** context and can return a value or a `Promise`.

**Example: Waiting for a specific condition**

```javascript
return new Promise((resolve) => {
  const check = () => {
    const status = document.querySelector(".status").innerText;
    if (status === "Completed") {
      resolve(document.querySelector(".output").innerText);
      return true;
    }
    return false;
  };

  if (!check()) {
    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
```

---

## 🔍 Debugging & Inspection

To verify your registered tools and monitor execution, you can use the following methods:

### 1. Built-in Chrome WebMCP DevTools (Canary)
Starting with **Chrome 146 Canary**, Google has enabled a default **WebMCP Developer Tools** panel. 
- Open **Inspect (F12)** on any page.
- Look for the **WebMCP** tab.
- Here you can view real-time **Tool Contracts**, inspect registered tools, and monitor browser permission transitions as they happen.

### 2. WebMCP - Model Context Tool Inspector
For stable Chrome versions or enhanced visualization, you can download the **WebMCP - Model Context Tool Inspector** from the [Chrome Web Store](https://chrome.google.com/webstore). This extension provides a dedicated interface to browse all active WebMCP tools and their schemas.

---

## 🏗 Architecture

anyWebMCP uses a **Dual-Track Bridge**:

1. **Inject Script (Main World)**: Hijacks `navigator.modelContext` to register virtual tools and intercept execution requests.
2. **Content Script (Isolated World)**: Acts as a bridge between the page and the extension.
3. **Background Service Worker**: Manages state, handles cross-tab addressing, and maintains execution continuity during page refreshes.

---

## 📜 License

MIT License.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.
