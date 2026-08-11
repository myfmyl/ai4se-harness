import { describe, it, expect } from 'vitest';
import { HarnessEngine } from '../src/core/state-machine.js';
import { createMockProvider } from '../src/core/llm-provider.js';
import { loadConfig } from '../src/config/loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Integration: full harness pipeline with mock LLM', () => {
  const tmpDir = join(__dirname, '..', '.tmp-integration');

  beforeEach(() => { rmSync(tmpDir, { recursive: true, force: true }); mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('should fix a broken multiply function end-to-end', async () => {
    writeFileSync(join(tmpDir, 'math.ts'), 'export const multiply = (a: number, b: number) => a + b; // bug');
    writeFileSync(join(tmpDir, 'math.test.ts'), `
      import { describe, it, expect } from 'vitest';
      import { multiply } from './math';
      describe('multiply', () => {
        it('2 * 3 = 6', () => expect(multiply(2, 3)).toBe(6));
        it('5 * 5 = 25', () => expect(multiply(5, 5)).toBe(25));
      });
    `);

    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Read the broken file', tool: 'read_file', params: { path: 'math.ts' } }),
      JSON.stringify({ thinking: 'The bug is a+b instead of a*b. Fix it.', tool: 'write_file', params: { path: 'math.ts', content: 'export const multiply = (a: number, b: number): number => a * b;' } }),
      JSON.stringify({ thinking: 'Run tests to verify', tool: 'run_test', params: {} }),
      JSON.stringify({ thinking: 'Tests passed, task complete', tool: 'task_complete', params: { summary: 'Fixed multiply: changed + to *' } }),
    ]);

    const config = loadConfig();
    config.feedback.testCommand = 'node -e "process.exit(0)"';
    const engine = new HarnessEngine(mock, config, { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Fix the multiply function');

    const states = history.map(t => t.to);
    expect(states).toContain('THINKING');
    expect(states).toContain('EXECUTING');
    expect(states).toContain('OBSERVING');
    expect(states).toContain('DONE');
  });

  it('should handle guardrail -> approval rejection -> rethink', async () => {
    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Delete temp', tool: 'run_shell', params: { command: 'rm -rf /tmp' } }),
      JSON.stringify({ thinking: 'Use safer approach', tool: 'run_shell', params: { command: 'ls /tmp' } }),
      JSON.stringify({ thinking: 'Done', tool: 'task_complete', params: { summary: 'Used safe command' } }),
    ]);

    const engine = new HarnessEngine(mock, loadConfig(), { workspaceRoot: tmpDir, onTransition: () => {} });

    let history: any[] = [];
    const runPromise = engine.run('Clean temp').then(h => { history = h; });

    await new Promise(r => setTimeout(r, 100));
    if (engine.getState() === 'WAITING_APPROVAL') {
      engine.reject();
    }

    await runPromise;
    expect(history.some((t: any) => t.to === 'WAITING_APPROVAL')).toBe(true);
  });
});
