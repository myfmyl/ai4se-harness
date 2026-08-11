import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli/index.js';

describe('CLI Argument Parser', () => {
  it('should parse run command', () => {
    const result = parseArgs(['node', 'cli.js', 'run', 'fix the bug']);
    expect(result.command).toBe('run');
    expect(result.args).toBe('fix the bug');
  });

  it('should parse setup command', () => {
    expect(parseArgs(['node', 'cli.js', 'setup']).command).toBe('setup');
    expect(parseArgs(['node', 'cli.js', 'setup', '--force']).force).toBe(true);
  });

  it('should parse config command', () => {
    expect(parseArgs(['node', 'cli.js', 'config']).command).toBe('config');
    expect(parseArgs(['node', 'cli.js', 'config', '--show-key-status']).showKeyStatus).toBe(true);
  });

  it('should parse serve command', () => {
    const result = parseArgs(['node', 'cli.js', 'serve', '--port', '4000']);
    expect(result.command).toBe('serve');
    expect(result.port).toBe('4000');
  });

  it('should default to help for unknown command', () => {
    expect(parseArgs(['node', 'cli.js', 'unknown']).command).toBe('help');
  });
});
