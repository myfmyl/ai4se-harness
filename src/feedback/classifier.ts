import type { FeedbackItem, FeedbackResult } from '../types.js';

export function classify(items: FeedbackItem[], exitCode: number, stderr: string): FeedbackResult {
  let status: FeedbackResult['status'];

  if (exitCode === 0 && items.length === 0) {
    status = 'PASS';
  } else if (items.some(i => i.type === 'test_case')) {
    status = 'TEST_FAILURE';
  } else if (/error\s+TS\d+/i.test(stderr)) {
    status = 'TYPE_ERROR';
  } else if (/SyntaxError/i.test(stderr)) {
    status = 'SYNTAX_ERROR';
  } else if (/cannot find module|module not found|import.*error/i.test(stderr)) {
    status = 'MODULE_ERROR';
  } else if (/compilation failed|build failed/i.test(stderr)) {
    status = 'BUILD_ERROR';
  } else {
    status = 'UNKNOWN_FAILURE';
  }

  return {
    status,
    items,
    summary: buildSummary(status, items),
    rawOutput: stderr,
  };
}

function buildSummary(status: string, items: FeedbackItem[]): string {
  if (status === 'PASS') return 'All checks passed';
  if (items.length === 0) return `Failure: ${status}`;
  const errorItems = items.filter(i => i.severity === 'error');
  return `${errorItems.length} error(s) found: ${errorItems.map(i => i.message).join('; ').slice(0, 500)}`;
}
