// State enum
export type State = 'IDLE' | 'THINKING' | 'GUARDING' | 'EXECUTING' | 'WAITING_APPROVAL' | 'OBSERVING' | 'FEEDBACK' | 'DONE';

// Action the LLM can request
export interface Action {
  type: 'read_file' | 'write_file' | 'run_shell' | 'run_test' | 'run_lint' | 'task_complete';
  params: Record<string, unknown>;
  rawText: string;
}

// Result of executing a tool
export interface ToolResult {
  toolType: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

// One state transition in the history
export interface StateTransition {
  from: State;
  to: State;
  timestamp: string;
  action?: Action;
  result?: ToolResult;
  metadata?: Record<string, unknown>;
}

// Parsed feedback item from test/lint output
export interface FeedbackItem {
  type: 'test_case' | 'lint_error' | 'build_error' | 'type_error';
  severity: 'error' | 'warning';
  file?: string;
  line?: number;
  message: string;
  expected?: string;
  actual?: string;
}

// Structured feedback result
export interface FeedbackResult {
  status: 'PASS' | 'TEST_FAILURE' | 'TYPE_ERROR' | 'SYNTAX_ERROR' | 'MODULE_ERROR' | 'BUILD_ERROR' | 'UNKNOWN_FAILURE';
  items: FeedbackItem[];
  summary: string;
  rawOutput: string;
}

// Project memory entry
export interface MemoryEntry {
  id: string;
  type: 'convention' | 'decision' | 'fact';
  content: string;
  tags: string[];
  createdAt: string;
}

// Full harness configuration
export interface HarnessConfig {
  llm: { provider: string; model: string; maxTokens: number };
  tools: { workspaceRoot: string; allowedCommands: string[] };
  guardrails: { blockedPatterns: string[]; requireApprovalFor: string[] };
  feedback: { maxRetries: number; testCommand: string; lintCommand: string; maxIdenticalFailures: number };
  execution: { maxToolCalls: number; timeoutSeconds: number };
}

// LLM message format (Anthropic-compatible)
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// LLM Provider abstraction — injectable for mock testing
export interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<string>;
}

// The response an LLM gives
export interface LLMResponse {
  thinking: string;
  tool: string;
  params: Record<string, unknown>;
}
