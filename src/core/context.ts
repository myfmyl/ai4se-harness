import type { LLMMessage, MemoryEntry, FeedbackResult } from '../types.js';
import { injectFeedback } from '../feedback/injector.js';

const SYSTEM_PROMPT = `You are a coding agent. You have tools: read_file, write_file, run_shell, run_test, run_lint, task_complete.
Respond with JSON only:
{"thinking": "<your reasoning>", "tool": "<tool_name>", "params": { ... }}

read_file: {"path": "relative/path"}
write_file: {"path": "relative/path", "content": "..."}
run_shell: {"command": "shell command"}
run_test: {} (runs configured test command)
run_lint: {} (runs configured lint command)
task_complete: {"summary": "what was accomplished"}

Always run tests after making code changes. Do NOT execute dangerous commands.`;

export function buildContext(
  task: string,
  history: LLMMessage[],
  memories: MemoryEntry[],
  feedbackResult?: FeedbackResult,
  retryCount?: number,
  maxRetries?: number,
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  let system = SYSTEM_PROMPT;
  if (memories.length > 0) {
    system += '\n\n## Project Memory\n' + memories.map(m => `- ${m.content}`).join('\n');
  }

  messages.push({ role: 'system', content: system });

  if (feedbackResult) {
    messages.push({ role: 'user', content: injectFeedback(feedbackResult, retryCount!, maxRetries!) });
  }

  messages.push(...history);

  if (history.length === 0) {
    messages.push({ role: 'user', content: `Task: ${task}` });
  }

  return messages;
}
