import { describe, it, expect } from 'vitest';
import { classify } from '../src/feedback/classifier.js';

describe('Feedback Classifier', () => {
  it('should return PASS when no items and exitCode 0', () => {
    const result = classify([], 0, '');
    expect(result.status).toBe('PASS');
  });

  it('should return TEST_FAILURE for test items with non-zero exit', () => {
    const result = classify([{ type: 'test_case', severity: 'error', message: 'fail' }], 1, '');
    expect(result.status).toBe('TEST_FAILURE');
  });

  it('should return TYPE_ERROR when stderr has TS type error', () => {
    const result = classify([], 2, 'src/math.ts(10,5): error TS2345: Argument of type string...');
    expect(result.status).toBe('TYPE_ERROR');
  });

  it('should return SYNTAX_ERROR for parse errors', () => {
    const result = classify([], 1, 'SyntaxError: Unexpected token');
    expect(result.status).toBe('SYNTAX_ERROR');
  });

  it('should return BUILD_ERROR for compilation errors', () => {
    const result = classify([], 1, 'src/index.ts: error: Compilation failed');
    expect(result.status).toBe('BUILD_ERROR');
  });

  it('should return UNKNOWN_FAILURE for unrecognized failures', () => {
    const result = classify([], 1, 'something went wrong');
    expect(result.status).toBe('UNKNOWN_FAILURE');
  });
});
