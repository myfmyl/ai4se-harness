import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadConfig, defaultConfig } from '../src/config/loader.js';

describe('Config Loader', () => {
  const tmpDir = join(__dirname, '..', '.tmp-test');

  beforeEach(() => { rmSync(tmpDir, { recursive: true, force: true }); mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('should return default config when no file exists', () => {
    const config = loadConfig(join(tmpDir, 'nonexistent.json'));
    expect(config.feedback.maxRetries).toBe(5);
    expect(config.llm.model).toBe('claude-sonnet-5-20251001');
  });

  it('should load and merge partial config over defaults', () => {
    writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
      feedback: { maxRetries: 3 },
      llm: { model: 'custom-model' },
    }));
    const config = loadConfig(join(tmpDir, 'config.json'));
    expect(config.feedback.maxRetries).toBe(3);
    expect(config.llm.model).toBe('custom-model');
    expect(config.execution.maxToolCalls).toBe(50);
  });

  it('should validate required fields have sensible defaults', () => {
    const config = loadConfig(join(tmpDir, 'nonexistent.json'));
    expect(config.execution.maxToolCalls).toBeGreaterThan(0);
    expect(config.guardrails.blockedPatterns.length).toBeGreaterThan(0);
    expect(config.tools.allowedCommands.length).toBeGreaterThan(0);
  });
});
