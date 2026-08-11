import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MemoryStore } from '../src/memory/store.js';

describe('Memory Store', () => {
  const tmpDir = join(__dirname, '..', '.tmp-memory-test');

  beforeEach(() => { rmSync(tmpDir, { recursive: true, force: true }); mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('should load empty memories when no store exists', async () => {
    const store = new MemoryStore();
    const memories = await store.load(tmpDir);
    expect(memories).toEqual([]);
  });

  it('should save and load a memory entry', async () => {
    const store = new MemoryStore();
    await store.save(tmpDir, { id: '1', type: 'convention', content: 'Use tabs', tags: ['style'], createdAt: new Date().toISOString() });
    const memories = await store.load(tmpDir);
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe('Use tabs');
  });

  it('should search memories by content', () => {
    const entries = [
      { id: '1', type: 'convention' as const, content: 'Use tabs not spaces', tags: ['style'], createdAt: '' },
      { id: '2', type: 'decision' as const, content: 'Use vitest for testing', tags: ['testing'], createdAt: '' },
      { id: '3', type: 'fact' as const, content: 'The main file is src/index.ts', tags: ['structure'], createdAt: '' },
    ];
    const store = new MemoryStore();
    const results = store.search(entries, 'test');
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('vitest');
  });
});
