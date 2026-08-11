import { describe, it, expect } from 'vitest';
import { executeTool } from '../src/tools/executor.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { Action } from '../src/types.js';

describe('Tool Executor', () => {
  const tmpDir = join(__dirname, '..', '.tmp-test-tools');

  beforeEach(() => { rmSync(tmpDir, { recursive: true, force: true }); mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('should read a file', async () => {
    writeFileSync(join(tmpDir, 'test.txt'), 'hello world');
    const action: Action = { type: 'read_file', params: { path: 'test.txt' }, rawText: '' };
    const result = await executeTool(action, tmpDir);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('hello world');
  });

  it('should write a file', async () => {
    const action: Action = { type: 'write_file', params: { path: 'out.txt', content: 'new content' }, rawText: '' };
    const result = await executeTool(action, tmpDir);
    expect(result.success).toBe(true);
  });

  it('should reject path traversal in read_file', async () => {
    const action: Action = { type: 'read_file', params: { path: '../../../etc/passwd' }, rawText: '' };
    const result = await executeTool(action, tmpDir);
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('outside workspace');
  });

  it('should reject path traversal in write_file', async () => {
    const action: Action = { type: 'write_file', params: { path: '../escape.txt', content: 'x' }, rawText: '' };
    const result = await executeTool(action, tmpDir);
    expect(result.success).toBe(false);
  });

  it('should run a safe shell command', async () => {
    const action: Action = { type: 'run_shell', params: { command: 'echo hello' }, rawText: '' };
    const result = await executeTool(action, tmpDir);
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should return error for unknown tool type', async () => {
    const action: Action = { type: 'unknown_tool' as any, params: {}, rawText: '' };
    const result = await executeTool(action, tmpDir);
    expect(result.success).toBe(false);
  });
});
