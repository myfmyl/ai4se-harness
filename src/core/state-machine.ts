import type { LLMProvider, State, StateTransition, Action, ToolResult, FeedbackResult, MemoryEntry } from '../types.js';
import type { HarnessConfig } from '../types.js';
import { buildContext } from './context.js';
import { executeTool } from '../tools/executor.js';
import { isDangerous } from '../guardrails/guard.js';
import { parseTestOutput, parseLintOutput } from '../feedback/parser.js';
import { classify } from '../feedback/classifier.js';
import { injectFeedback } from '../feedback/injector.js';

export interface EngineOptions {
  workspaceRoot: string;
  onTransition: (t: StateTransition) => void;
}

export class HarnessEngine {
  private state: State = 'IDLE';
  private history: StateTransition[] = [];
  private retryCount = 0;
  private turnCount = 0;
  private messages: { role: 'user' | 'assistant'; content: string }[] = [];
  private memories: MemoryEntry[] = [];

  constructor(
    private llm: LLMProvider,
    private config: HarnessConfig,
    private options: EngineOptions,
  ) {}

  async run(task: string): Promise<StateTransition[]> {
    this.transition('IDLE', 'THINKING', { metadata: { task } });

    while (this.state !== 'DONE') {
      if (this.turnCount >= this.config.execution.maxToolCalls) {
        this.finalize(false, 'Max tool calls exceeded');
        break;
      }

      switch (this.state) {
        case 'THINKING': await this.doThink(task); break;
        case 'GUARDING': await this.doGuard(); break;
        case 'EXECUTING': await this.doExecute(); break;
        case 'WAITING_APPROVAL': break;
        case 'OBSERVING': await this.doObserve(); break;
        case 'FEEDBACK': await this.doFeedback(); break;
      }

      if (this.state === 'WAITING_APPROVAL') break;

      this.turnCount++;
    }

    return this.history;
  }

  async doThink(task: string): Promise<void> {
    const reversed = [...this.history].reverse();
    const lastFeedbackTransition = reversed.find(t => t.metadata?.feedbackResult);
    const feedbackResult = lastFeedbackTransition?.metadata?.feedbackResult as FeedbackResult | undefined;

    const context = buildContext(
      task,
      this.messages,
      this.memories,
      this.retryCount > 0 ? feedbackResult : undefined,
      this.retryCount,
      this.config.feedback.maxRetries,
    );
    const response = await this.llm.chat(context);
    this.messages.push({ role: 'assistant', content: response });

    let parsed: { thinking: string; tool: string; params: Record<string, unknown> };
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/(\{[\s\S]*\})/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] || jsonMatch[0] : response);
    } catch {
      this.messages.push({ role: 'user', content: 'Invalid JSON format. Please respond with valid JSON: {"thinking":"...","tool":"...","params":{...}}' });
      return;
    }

    const action: Action = { type: parsed.tool as any, params: parsed.params || {}, rawText: response };
    this.lastAction = action;
    this.transition('THINKING', 'GUARDING', { action });
  }

  private lastAction: Action | null = null;

  async doGuard(): Promise<void> {
    const action = this.lastAction!;
    if (action.type === 'run_shell') {
      const cmd = String(action.params.command || '');
      const dangerCheck = isDangerous(cmd, this.config.guardrails.blockedPatterns);
      if (dangerCheck.dangerous) {
        this.transition('GUARDING', 'WAITING_APPROVAL', { metadata: { reason: dangerCheck.reason } });
        return;
      }
    }
    this.transition('GUARDING', 'EXECUTING');
  }

  async doExecute(): Promise<void> {
    const action = this.lastAction!;
    const result = await executeTool(
      action,
      this.options.workspaceRoot,
      this.config.feedback.testCommand,
      this.config.feedback.lintCommand,
    );
    this.lastResult = result;
    this.transition('EXECUTING', 'OBSERVING', { result });
  }

  private lastResult: ToolResult | null = null;

  async doObserve(): Promise<void> {
    const result = this.lastResult!;
    if (result.stdout) {
      this.messages.push({ role: 'user', content: `Tool output:\n${result.stdout.slice(0, 4000)}` });
    }
    if (result.stderr) {
      this.messages.push({ role: 'user', content: `Tool error:\n${result.stderr.slice(0, 4000)}` });
    }

    const hasFeedback = result.toolType === 'run_test' || result.toolType === 'run_lint'
      || (result.toolType === 'task_complete' && this.retryCount === 0);

    if (hasFeedback && result.toolType === 'task_complete') {
      this.finalize(true, 'Task completed successfully');
      return;
    }

    if (this.lastAction?.type === 'task_complete') {
      this.finalize(true, 'Task completed');
      return;
    }

    if (hasFeedback) {
      this.transition('OBSERVING', 'FEEDBACK');
    } else {
      this.transition('OBSERVING', 'THINKING');
    }
  }

  async doFeedback(): Promise<void> {
    const result = this.lastResult!;
    const items = result.toolType === 'run_lint'
      ? parseLintOutput(result.stdout)
      : parseTestOutput(result.stdout);

    const fbResult: FeedbackResult = classify(items, result.exitCode, result.stderr);
    this.retryCount++;

    if (fbResult.status === 'PASS') {
      this.finalize(true, fbResult.summary);
      return;
    }

    if (this.retryCount >= this.config.feedback.maxRetries) {
      this.finalize(false, `Max retries (${this.config.feedback.maxRetries}) exhausted. Last status: ${fbResult.status}`);
      return;
    }

    const injected = injectFeedback(fbResult, this.retryCount, this.config.feedback.maxRetries);
    this.messages.push({ role: 'user', content: injected });
    this.transition('FEEDBACK', 'THINKING', { metadata: { feedbackResult: fbResult } });
  }

  private finalize(success: boolean, reason: string): void {
    this.history.push({
      from: this.state,
      to: 'DONE',
      timestamp: new Date().toISOString(),
      metadata: { reason, success },
    });
    this.state = 'DONE';
  }

  private transition(from: State, to: State, extra?: { action?: Action; result?: ToolResult; metadata?: Record<string, unknown> }): void {
    const t: StateTransition = {
      from,
      to,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    this.history.push(t);
    this.state = to;
    this.options.onTransition(t);
  }

  approve(): void {
    if (this.state === 'WAITING_APPROVAL') {
      this.lastAction = [...this.history].reverse().find(t => t.action)?.action || null;
      this.transition('WAITING_APPROVAL', 'EXECUTING');
    }
  }

  reject(): void {
    if (this.state === 'WAITING_APPROVAL') {
      this.messages.push({ role: 'user', content: 'That command was rejected by the safety guard. Find an alternative approach.' });
      this.transition('WAITING_APPROVAL', 'THINKING');
    }
  }

  getState(): State { return this.state; }
  getHistory(): StateTransition[] { return this.history; }
}
