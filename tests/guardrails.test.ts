import { describe, it, expect } from 'vitest';
import { checkCommand, checkPath, isDangerous } from '../src/guardrails/guard.js';

describe('Guardrails', () => {
  describe('isDangerous', () => {
    const blockedPatterns = ['rm -rf', 'sudo', 'DROP TABLE', 'DELETE FROM', '> /dev/', 'git push --force', 'chmod 777'];

    it('should flag rm -rf as dangerous', () => {
      const result = isDangerous('rm -rf /', blockedPatterns);
      expect(result.dangerous).toBe(true);
      expect(result.reason).toContain('rm -rf');
    });

    it('should flag sudo as dangerous', () => {
      expect(isDangerous('sudo npm install', blockedPatterns).dangerous).toBe(true);
    });

    it('should flag DROP TABLE as dangerous', () => {
      expect(isDangerous('echo "DROP TABLE users;" | sqlite3 db', blockedPatterns).dangerous).toBe(true);
    });

    it('should flag DELETE FROM as dangerous', () => {
      expect(isDangerous('DELETE FROM users WHERE id=1', blockedPatterns).dangerous).toBe(true);
    });

    it('should allow safe commands', () => {
      expect(isDangerous('ls -la', blockedPatterns).dangerous).toBe(false);
      expect(isDangerous('npm test', blockedPatterns).dangerous).toBe(false);
      expect(isDangerous('cat README.md', blockedPatterns).dangerous).toBe(false);
      expect(isDangerous('git status', blockedPatterns).dangerous).toBe(false);
    });

    it('should catch rm variants (rm -rf, rm --recursive --force)', () => {
      expect(isDangerous('rm --recursive --force /tmp', blockedPatterns).dangerous).toBe(true);
    });

    it('should handle empty command', () => {
      expect(isDangerous('', blockedPatterns).dangerous).toBe(false);
    });
  });

  describe('checkPath', () => {
    it('should allow paths within workspace', () => {
      expect(checkPath('src/index.ts', '/Users/test/project').safe).toBe(true);
      expect(checkPath('./src/index.ts', '/Users/test/project').safe).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      const result = checkPath('../../../etc/passwd', '/Users/test/project');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('outside workspace');
    });

    it('should reject absolute paths outside workspace', () => {
      const result = checkPath('/etc/passwd', '/Users/test/project');
      expect(result.safe).toBe(false);
    });

    it('should allow absolute paths inside workspace', () => {
      const result = checkPath('/Users/test/project/src/index.ts', '/Users/test/project');
      expect(result.safe).toBe(true);
    });
  });
});
