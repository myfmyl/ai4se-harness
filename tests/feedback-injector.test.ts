import { describe, it, expect } from 'vitest';
import { injectFeedback } from '../src/feedback/injector.js';
import type { FeedbackResult } from '../src/types.js';

describe('Feedback Injector', () => {
  it('should format a PASS result', () => {
    const result: FeedbackResult = { status: 'PASS', items: [], summary: 'All 5 tests passed', rawOutput: '' };
    const text = injectFeedback(result, 1, 5);
    expect(text).toContain('[FEEDBACK]');
    expect(text).toContain('Cycle 1/5');
    expect(text).toContain('PASS');
  });

  it('should format a TEST_FAILURE with items', () => {
    const result: FeedbackResult = {
      status: 'TEST_FAILURE', items: [
        { type: 'test_case', severity: 'error', message: 'multiply works', expected: '6', actual: '5' },
      ],
      summary: '1/3 tests failed', rawOutput: '...',
    };
    const text = injectFeedback(result, 2, 5);
    expect(text).toContain('TEST_FAILURE');
    expect(text).toContain('multiply works');
    expect(text).toContain('expected "6"');
    expect(text).toContain('got "5"');
  });

  it('should include max retry warning on last attempt', () => {
    const result: FeedbackResult = { status: 'TEST_FAILURE', items: [], summary: '', rawOutput: '' };
    const text = injectFeedback(result, 5, 5);
    expect(text).toContain('FINAL ATTEMPT');
  });
});
