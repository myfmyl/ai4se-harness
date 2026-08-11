import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { MemoryEntry } from '../types.js';

export class MemoryStore {
  private cache: Map<string, MemoryEntry[]> = new Map();

  async load(projectDir: string): Promise<MemoryEntry[]> {
    if (this.cache.has(projectDir)) return this.cache.get(projectDir)!;

    const storePath = join(projectDir, '.harness', 'memory', 'store.json');
    try {
      const raw = readFileSync(storePath, 'utf-8');
      const entries = JSON.parse(raw) as MemoryEntry[];
      this.cache.set(projectDir, entries);
      return entries;
    } catch {
      return [];
    }
  }

  async save(projectDir: string, entry: MemoryEntry): Promise<void> {
    const entries = await this.load(projectDir);
    entries.push(entry);
    const storeDir = join(projectDir, '.harness', 'memory');
    if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true });
    writeFileSync(join(storeDir, 'store.json'), JSON.stringify(entries, null, 2));
    this.cache.set(projectDir, entries);
  }

  search(entries: MemoryEntry[], query: string): MemoryEntry[] {
    const lower = query.toLowerCase();
    return entries.filter(e =>
      e.content.toLowerCase().includes(lower) ||
      e.tags.some(t => t.toLowerCase().includes(lower))
    );
  }
}
