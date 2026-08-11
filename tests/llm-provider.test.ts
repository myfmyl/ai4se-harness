import { describe, it, expect } from 'vitest';
import { createAnthropicProvider, createMockProvider } from '../src/core/llm-provider.js';

describe('LLM Provider', () => {
  describe('createMockProvider', () => {
    it('should return pre-configured responses in order', async () => {
      const mock = createMockProvider(['hello', 'world']);
      const r1 = await mock.chat([{ role: 'user', content: 'hi' }]);
      const r2 = await mock.chat([{ role: 'user', content: 'again' }]);
      expect(r1).toBe('hello');
      expect(r2).toBe('world');
    });

    it('should cycle when responses exhausted', async () => {
      const mock = createMockProvider(['only']);
      await mock.chat([{ role: 'user', content: 'first' }]);
      const r2 = await mock.chat([{ role: 'user', content: 'second' }]);
      expect(r2).toBe('only');
    });

    it('should record all calls for inspection', async () => {
      const mock = createMockProvider(['ok']);
      await mock.chat([{ role: 'user', content: 'msg1' }]);
      await mock.chat([{ role: 'user', content: 'msg2' }]);
      expect(mock.calls.length).toBe(2);
      expect(mock.calls[0][0].content).toBe('msg1');
    });
  });
});
