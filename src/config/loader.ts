import { readFileSync } from 'fs';
import type { HarnessConfig } from '../types.js';

export function defaultConfig(): HarnessConfig {
  return {
    llm: { provider: 'anthropic', model: 'claude-sonnet-5-20251001', maxTokens: 4096 },
    tools: { workspaceRoot: '.', allowedCommands: ['npm', 'npx', 'node', 'ls', 'cat', 'grep', 'find', 'git', 'tsc', 'vitest', 'eslint'] },
    guardrails: { blockedPatterns: ['rm -rf', 'sudo', 'DROP TABLE', 'DELETE FROM', '> /dev/', 'curl.*|.*sh', 'git push --force', 'chmod 777'], requireApprovalFor: ['git push', 'npm publish', 'docker'] },
    feedback: { maxRetries: 5, testCommand: 'npm test', lintCommand: 'npm run lint', maxIdenticalFailures: 3 },
    execution: { maxToolCalls: 50, timeoutSeconds: 300 },
  };
}

export function loadConfig(filePath?: string): HarnessConfig {
  const defaults = defaultConfig();
  if (!filePath) return defaults;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const partial = JSON.parse(raw) as Partial<HarnessConfig>;
    return deepMerge(defaults, partial);
  } catch {
    return defaults;
  }
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] as any, override[key] as any);
    } else {
      result[key] = override[key] as any;
    }
  }
  return result;
}
