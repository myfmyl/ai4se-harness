import type { FeedbackItem } from '../types.js';

export function parseTestOutput(raw: string): FeedbackItem[] {
  try {
    const json = JSON.parse(raw);
    return parseVitestJson(json);
  } catch {
    return parsePlainText(raw);
  }
}

function parseVitestJson(json: any): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  if (!json.testResults) return items;
  for (const suite of json.testResults) {
    if (!suite.assertionResults) continue;
    for (const test of suite.assertionResults) {
      if (test.status === 'failed') {
        const failureMsg = test.failureMessages?.[0] || '';
        const match = failureMsg.match(/expected\s+(.+?)[,.]?\s+got\s+(.+)/i);
        items.push({
          type: 'test_case',
          severity: 'error',
          message: `${test.title}: ${failureMsg.slice(0, 200)}`,
          expected: match?.[1]?.trim(),
          actual: match?.[2]?.trim(),
        });
      }
    }
  }
  return items;
}

function parsePlainText(raw: string): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const failMatch = line.match(/FAIL\s+(\S+)\s*>\s*(.+)/);
    if (failMatch) {
      items.push({ type: 'test_case', severity: 'error', message: line.trim() });
    }
    const expectMatch = line.match(/expected\s+(.+?)[,.]?\s+got\s+(.+)/i);
    if (expectMatch && items.length > 0) {
      items[items.length - 1].expected = expectMatch[1].trim();
      items[items.length - 1].actual = expectMatch[2].trim();
    }
  }
  return items;
}

export function parseLintOutput(raw: string): FeedbackItem[] {
  try {
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    return json.map((item: any) => ({
      type: 'lint_error' as const,
      severity: item.severity === 2 ? 'error' as const : 'warning' as const,
      file: item.filePath,
      line: item.line,
      message: item.message || '',
    }));
  } catch {
    return [];
  }
}
