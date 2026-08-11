import { describe, it, expect } from 'vitest';
import { HarnessEngine } from '../src/core/state-machine.js';
import { createMockProvider } from '../src/core/llm-provider.js';
import { loadConfig } from '../src/config/loader.js';
import { isDangerous } from '../src/guardrails/guard.js';
import { parseTestOutput } from '../src/feedback/parser.js';
import { classify } from '../src/feedback/classifier.js';
import { injectFeedback } from '../src/feedback/injector.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(__dirname, '..', '.tmp-demo');

describe('Mechanism Demo (§A.6)', () => {
  beforeEach(() => { rmSync(tmpDir, { recursive: true, force: true }); mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // ① Guardrail intercepts dangerous action
  it('① Guardrail: intercepts rm -rf and stops at WAITING_APPROVAL', async () => {
    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Clean up', tool: 'run_shell', params: { command: 'rm -rf /important/data' } }),
    ]);
    const engine = new HarnessEngine(mock, loadConfig(), { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Delete old data');

    const waitingApproval = history.find(t => t.to === 'WAITING_APPROVAL');
    expect(waitingApproval).toBeDefined();
    expect(waitingApproval!.metadata?.reason).toBeDefined();

    // Verify it did NOT execute
    const executed = history.filter(t => t.to === 'EXECUTING' && t.action?.type === 'run_shell');
    expect(executed.length).toBe(0);
  });

  // ② Feedback loop correction
  it('② Feedback: injects test failure and agent sees correction feedback', { timeout: 30000 }, async () => {
    writeFileSync(join(tmpDir, 'math.ts'), 'export const multiply = (a: number, b: number) => a + b;'); // bug!

    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Running tests', tool: 'run_test', params: {} }),
      JSON.stringify({ thinking: 'Fixing multiply', tool: 'write_file', params: { path: 'math.ts', content: 'export const multiply=(a,b)=>a*b;' } }),
      JSON.stringify({ thinking: 'Re-testing', tool: 'run_test', params: {} }),
      JSON.stringify({ thinking: 'All good', tool: 'task_complete', params: { summary: 'Fixed' } }),
    ]);

    const config = loadConfig();
    config.feedback.testCommand = 'node -e "process.exit(1)"';
    const engine = new HarnessEngine(mock, config, { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Fix multiply');

    const feedbackTransitions = history.filter(t => t.to === 'FEEDBACK');
    expect(feedbackTransitions.length).toBeGreaterThan(0);

    // Verify the loop continued after feedback
    const thinkAfterFeedback = history.some((t, i) =>
      t.to === 'THINKING' && history[i - 1]?.to === 'FEEDBACK'
    );
    expect(thinkAfterFeedback).toBe(true);
  });

  // ③ Retry exhaustion
  it('③ Feedback: max retries leads to DONE(failed)', { timeout: 30000 }, async () => {
    const responses = Array.from({ length: 5 }, () =>
      JSON.stringify({ thinking: 'trying test', tool: 'run_test', params: {} })
    );
    const mock = createMockProvider(responses);
    const config = loadConfig();
    config.feedback.maxRetries = 2;
    config.feedback.testCommand = 'node -e "process.exit(1)"';
    config.execution.maxToolCalls = 20;

    const engine = new HarnessEngine(mock, config, { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Make tests pass');

    const lastTransition = history[history.length - 1];
    expect(lastTransition.to).toBe('DONE');
    expect(lastTransition.metadata?.success).toBe(false);
    expect(lastTransition.metadata?.reason).toContain('Max retries');
  });

  // Bonus: deterministic unit tests for isolated components (no LLM needed)
  describe('Deterministic component tests (no LLM)', () => {
    it('guardrail: isDangerous is pure function', () => {
      expect(isDangerous('rm -rf /', ['rm -rf', 'sudo']).dangerous).toBe(true);
      expect(isDangerous('npm test', ['rm -rf', 'sudo']).dangerous).toBe(false);
      expect(isDangerous('', []).dangerous).toBe(false);
    });

    it('feedback: parser extracts failures from JSON', () => {
      const items = parseTestOutput(JSON.stringify({
        numFailedTests: 1,
        testResults: [{ assertionResults: [{ status: 'failed', title: 'test', failureMessages: ['expected 6 got 5'] }] }],
      }));
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('test_case');
    });

    it('feedback: classifier returns TEST_FAILURE for test failures', () => {
      const result = classify([{ type: 'test_case', severity: 'error', message: 'fail' }], 1, '');
      expect(result.status).toBe('TEST_FAILURE');
    });

    it('feedback: injector formats retry warning', () => {
      const result = { status: 'TEST_FAILURE' as const, items: [], summary: 'fail', rawOutput: '' };
      const text = injectFeedback(result, 5, 5);
      expect(text).toContain('FINAL ATTEMPT');
    });
  });
});
