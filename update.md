---
## Update Log [2026-03-18 11:59:29]

### 1. Core Workflow and Logic Optimization
- **Enhanced Dual-Bridge Architecture**: Refined the RPC communication mechanism between the Main World and the Isolated World.
- **Real-time Synchronization**: Introduced `chrome.storage.onChanged` listeners to apply configuration changes without page refreshes.

### 2. Deep Development of Configuration Management (Options Page)
- **Multi-parameter Support**: The editor now supports dynamically adding unlimited input parameter items.
- **Strict Validity Checks**: Implemented comprehensive validation for tool names (regex), required selectors, and URL patterns before saving.

### 3. Storage and Import/Export System
- **Export Functionality**: Supports exporting configuration files in JSON format with timestamps.
- **Import Deduplication Logic**:
    - Prioritizes matching existing configurations by ID.
    - Secondarily matches by `toolName + urlPattern` for semantic similarity, automatically updating existing tools or adding new ones.
    - Conflict Handling: Prevents tool name conflicts across different URLs.
- **Enhanced Feedback**: Provides clear counts of "Added" and "Updated" items after import.

### 4. DOM Execution Engine and WebMCP Integration
- **Native Event Simulation**: Automatically triggers `input` and `change` events after filling data, ensuring compatibility with modern frameworks like React and Vue.
- **Intelligent Output Scraping**: Optimized `scrapeOutput` using `MutationObserver` to handle typewriter effects and ensure complete results.
- **Tool Lifecycle Management**: Automatically calls `unregisterTool` to clean up old tools during configuration changes.

### 5. Engineering Improvements
- **Package Management**: Fully migrated to `pnpm`.
- **Version Control**: Managed with Git with standardized commit records.
- **Language Standards**: Full TypeScript development, verified with `pnpm build`.

---

## Update Log [2026-03-18 22:30:00] (V3.2 - Background-Driven Enhancement)

### 1. Unified Execution Architecture

- **Hijacking `executeTool`**: Deeply hijacked the execution entry point at the `navigator.modelContext` level, enabling transparent calling of both native and virtual tools.
- **Background-Driven Tasks**: Moved execution logic from unstable page scripts to the persistent `Background Script`, solving the issue of Promise loss due to page refreshes.

---

## Update Log [2026-03-18 23:15:00] (V3.3 - Automation Engine Evolution)

### 1. Intelligent Routing and Task Scheduling

- **Multi-tab Addressing**: The Background script now has the ability to automatically locate target pages matching the `urlPattern` across all open tabs and dispatch instructions.
- **Dynamic Tab Awakening**: When no matching page is found, the Background script can automatically open a new tab based on the configured `Entry URL` and execute the task once initialization is complete.

---

## Update Log [2026-03-23 16:30:00] (V3.4 - Advanced Scraping and Experience Optimization)

### 1. Deep Expansion of Scraping Capabilities

- **Advanced Selector Strategy**: Supports `First Match`, `Last Match` (for chats/dynamic lists), `Combine All Text`, and `Get Attribute Value` (extracting href/src/data, etc.).
- **Custom Script Mode**: Supports executing user-written JS code (with Promise support) within the **Main World** context, completely solving complex data cleaning and logic waiting issues.
- **innerText Adaptation**: Fully switched to `innerText` instead of `textContent` to ensure scraped content matches what users see visually, automatically filtering hidden elements and script blocks.

### 2. Execution Engine Performance Optimization

- **Zero-Latency Start**: Removed the hard-coded 500ms buffer in `scrapeOutput`, allowing Observer and Custom Script modes to respond instantly to DOM changes.
- **Enhanced Clipboard Filling**: `fillInputs` uses simulated clipboard paste event streams, significantly improving compatibility with complex React/Vue forms.

### 3. Options Page Interaction Refactoring

- **Semantic Options**: Refactored "Wait for Nav" to **"SPA - Results appear on current page"**, checked by default, significantly lowering the learning curve for users.
- **Logical Layout**: Reordered configuration blocks (Target -> Execution -> API Spec -> Output) to align with the "Define-Execute-Result" thinking process.
- **Dynamic UI Linkage**: The `Delay (ms)` configuration now only appears in **Static** mode and is automatically hidden in other modes, keeping the interface clean.

### 4. System Robustness Hardening

- **Namespace Protection**: Added the `ANYWEBMCP_` prefix to all communication messages and global variables, completely eliminating naming conflicts with other extensions or page scripts.
- **Dynamic Availability Verification**: `inject.ts` monitors DOM elements in real-time, only registering a tool when the submit button and all input fields exist on the page, ensuring a 100% success rate for tools seen by the AI.
