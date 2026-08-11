import { describe, it, expect } from 'vitest';
import { HarnessEngine } from '../src/core/state-machine.js';
import { createMockProvider } from '../src/core/llm-provider.js';
import { loadConfig } from '../src/config/loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('HarnessEngine (mock LLM)', () => {
  const tmpDir = join(__dirname, '..', '.tmp-state-test');

  beforeEach(() => { rmSync(tmpDir, { recursive: true, force: true }); mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('should complete a simple read_file → task_complete cycle', async () => {
    writeFileSync(join(tmpDir, 'math.ts'), 'export const add = (a: number, b: number) => a + b;');
    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Reading the file', tool: 'read_file', params: { path: 'math.ts' } }),
      JSON.stringify({ thinking: 'Done', tool: 'task_complete', params: { summary: 'Done reading' } }),
    ]);
    const engine = new HarnessEngine(mock, loadConfig(), { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Read math.ts');
    const states = history.map(t => t.to);
    expect(states).toContain('EXECUTING');
    expect(states).toContain('OBSERVING');
    expect(states).toContain('DONE');
  });

  it('should stop at WAITING_APPROVAL for dangerous commands', async () => {
    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Deleting temp files', tool: 'run_shell', params: { command: 'rm -rf /tmp/old' } }),
    ]);
    const engine = new HarnessEngine(mock, loadConfig(), { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Clean up');
    expect(history.some(t => t.to === 'WAITING_APPROVAL')).toBe(true);
  });

  it('should complete feedback loop when tests fail then pass', async () => {
    const mock = createMockProvider([
      JSON.stringify({ thinking: 'Writing math.ts', tool: 'write_file', params: { path: 'math.ts', content: 'export const multiply = (a,b) => a + b; // wrong' } }),
      JSON.stringify({ thinking: 'Testing', tool: 'run_test', params: {} }),
      JSON.stringify({ thinking: 'Fixing', tool: 'write_file', params: { path: 'math.ts', content: 'export const multiply = (a,b) => a * b;' } }),
      JSON.stringify({ thinking: 'Re-testing', tool: 'run_test', params: {} }),
      JSON.stringify({ thinking: 'All good', tool: 'task_complete', params: { summary: 'Fixed multiply' } }),
    ]);
    const config = loadConfig();
    config.feedback.testCommand = 'node -e "process.exit(1)"';
    const engine = new HarnessEngine(mock, config, { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Fix multiply');
    expect(history.some(t => t.to === 'FEEDBACK')).toBe(true);
    expect(history.some(t => t.to === 'DONE')).toBe(true);
  });

  it('should stop after max retries exhausted', async () => {
    const responses: string[] = [];
    for (let i = 0; i < 6; i++) {
      responses.push(JSON.stringify({ thinking: 'trying...', tool: 'run_test', params: {} }));
    }
    const mock = createMockProvider(responses);
    const config = loadConfig();
    config.feedback.maxRetries = 2;
    config.feedback.testCommand = 'node -e "process.exit(1)"';
    config.execution.maxToolCalls = 10;
    const engine = new HarnessEngine(mock, config, { workspaceRoot: tmpDir, onTransition: () => {} });
    const history = await engine.run('Keep trying');
    expect(history[history.length - 1].to).toBe('DONE');
  });
});
