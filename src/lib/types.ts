export interface ToolInput {
  name: string;
  selector: string;
  description: string;
}

export interface ToolSubmit {
  selector: string;
  delay: number;
  waitForNavigation: boolean;
}

export type SelectorStrategy = 'first' | 'last' | 'all_text' | 'attribute';

export interface ToolOutput {
  selector: string; 
  triggerSelector?: string; // New: Element that triggers the end of observation
  mode: 'observer' | 'static' | 'custom_script';
  strategy?: SelectorStrategy; 
  attributeName?: string; 
  customScript?: string; 
  timeout: number;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  [key: string]: any;
}

export interface WebMcpConfig {
  id: string;
  urlPattern: string;
  entryUrl?: string;
  toolName: string;
  description: string;
  inputs: ToolInput[];
  submit: ToolSubmit;
  output: ToolOutput;
  annotations?: ToolAnnotations;
  enabled: boolean;
}

export interface AppState {
  globalEnabled: boolean;
  configs: WebMcpConfig[];
}

export interface WebMcpToolMetadata {
  name: string;
  description: string;
  inputSchema?: any;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any;
  id: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

// --- MCP / WebMCP Protocol Types ---

export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image"; data: string; mimeType: string };
export type ResourceContent = { 
  type: "resource"; 
  resource: { uri: string; mimeType: string; text?: string; blob?: string } 
};

export interface ToolResponse {
  content: Array<TextContent | ImageContent | ResourceContent>;
  isError?: boolean;
  meta?: {
    runtime_ms?: number;
    tokens_used?: number;
  };
}

// Background Task Types
export type TaskStatus = 'WAITING_START' | 'SUBMITTING' | 'WAITING_RESULT' | 'SCRAPING' | 'COMPLETED' | 'FAILED';

export interface BackgroundTask {
  id: string;
  config: WebMcpConfig;
  params: any;
  status: TaskStatus;
  callerTabId?: number;
  workerTabId?: number;
  startTime?: number; // Added for runtime tracking
}

// --- ANYWEBMCP Namespace Constants ---

export const ANYWEBMCP_MSG_TYPES = {
  CONFIG_MATCHED: 'ANYWEBMCP_CONFIG_MATCHED',
  EXECUTE_REQUEST: 'ANYWEBMCP_EXECUTE_REQUEST',
  EXECUTE_RESPONSE: 'ANYWEBMCP_EXECUTE_RESPONSE',
  BG_EXEC_COMMAND: 'ANYWEBMCP_BG_EXEC_COMMAND',
  REQUEST_CONFIGS: 'ANYWEBMCP_REQUEST_CONFIGS',
  EXEC_SCRIPT_REQUEST: 'ANYWEBMCP_EXEC_SCRIPT_REQUEST', // New: Request script execution
  EXEC_SCRIPT_RESPONSE: 'ANYWEBMCP_EXEC_SCRIPT_RESPONSE' // New: Script execution result
} as const;

export const ANYWEBMCP_SOURCES = {
  CONTENT: 'ANYWEBMCP_SOURCE_CONTENT',
  INJECTED: 'ANYWEBMCP_SOURCE_INJECTED',
  BACKGROUND: 'ANYWEBMCP_SOURCE_BACKGROUND'
} as const;

export type WebMcpBridgeMessage = 
  | { type: typeof ANYWEBMCP_MSG_TYPES.CONFIG_MATCHED; configs: WebMcpConfig[]; from: string }
  | { type: typeof ANYWEBMCP_MSG_TYPES.EXECUTE_REQUEST; payload: JsonRpcRequest; from: string }
  | { type: typeof ANYWEBMCP_MSG_TYPES.EXECUTE_RESPONSE; payload: JsonRpcResponse; from: string }
  | { type: typeof ANYWEBMCP_MSG_TYPES.BG_EXEC_COMMAND; command: 'FILL_AND_SUBMIT' | 'SCRAPE_ONLY'; config: WebMcpConfig; params?: any; requestId: string; from: string }
  | { type: typeof ANYWEBMCP_MSG_TYPES.REQUEST_CONFIGS; from: string }
  | { type: typeof ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_REQUEST; script: string; requestId: string; from: string }
  | { type: typeof ANYWEBMCP_MSG_TYPES.EXEC_SCRIPT_RESPONSE; result: any; error?: string; requestId: string; from: string };
