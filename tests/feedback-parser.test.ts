import { describe, it, expect } from 'vitest';
import { parseTestOutput, parseLintOutput } from '../src/feedback/parser.js';

describe('Feedback Parser', () => {
  describe('parseTestOutput — vitest JSON', () => {
    it('should parse passing vitest JSON output', () => {
      const json = JSON.stringify({
        numTotalTests: 3, numPassedTests: 3, numFailedTests: 0,
        testResults: [{ assertionResults: [{ status: 'passed', title: 'adds 1+1' }] }],
      });
      const items = parseTestOutput(json);
      expect(items.length).toBe(0);
    });

    it('should extract failing test cases from vitest JSON', () => {
      const json = JSON.stringify({
        numTotalTests: 3, numPassedTests: 1, numFailedTests: 2,
        testResults: [{
          assertionResults: [
            { status: 'passed', title: 'adds 1+1' },
            { status: 'failed', title: 'multiply works', failureMessages: ['expected 6, got 5'] },
            { status: 'failed', title: 'divide works', failureMessages: ['expected 5, got 3'] },
          ],
        }],
      });
      const items = parseTestOutput(json);
      expect(items.length).toBe(2);
      expect(items[0].type).toBe('test_case');
      expect(items[0].message).toContain('multiply works');
      expect(items[0].expected).toBeDefined();
    });
  });

  describe('parseTestOutput — plain text fallback', () => {
    it('should extract failures from plain text output', () => {
      const text = 'FAIL src/math.test.ts > multiply > 2 * 3 = 6\n  expected 6, got 5';
      const items = parseTestOutput(text);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].type).toBe('test_case');
    });

    it('should return empty for text with no failures', () => {
      const text = 'All tests passed! 5/5 passing';
      const items = parseTestOutput(text);
      expect(items.length).toBe(0);
    });
  });

  describe('parseLintOutput', () => {
    it('should parse eslint JSON output', () => {
      const json = JSON.stringify([{
        filePath: 'src/math.ts', line: 10, column: 5,
        severity: 2, message: 'Unexpected var, use let or const instead',
        ruleId: 'no-var',
      }]);
      const items = parseLintOutput(json);
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('lint_error');
      expect(items[0].file).toBe('src/math.ts');
      expect(items[0].line).toBe(10);
    });
  });
});
