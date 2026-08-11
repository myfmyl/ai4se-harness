import type { FeedbackResult } from '../types.js';

export function injectFeedback(result: FeedbackResult, cycle: number, maxRetries: number): string {
  const isLast = cycle >= maxRetries;
  let text = `[FEEDBACK] Cycle ${cycle}/${maxRetries}${isLast ? ' (FINAL ATTEMPT)' : ''}\n`;
  text += `Status: ${result.status}\n`;

  if (result.summary) {
    text += `${result.summary}\n`;
  }

  if (result.items.length > 0) {
    text += 'Failing items:\n';
    for (const item of result.items) {
      text += `  • ${item.message}`;
      if (item.expected) text += ` → expected "${item.expected}", got "${item.actual}"`;
      if (item.file) text += ` (${item.file}${item.line ? `:${item.line}` : ''})`;
      text += '\n';
    }
  }

  if (isLast) {
    text += 'This was the final attempt. The task will end after this cycle.\n';
  } else {
    text += 'Please fix the issues and re-run the tests.\n';
  }

  return text;
}
