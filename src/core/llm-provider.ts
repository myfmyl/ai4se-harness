import type { LLMProvider, LLMMessage } from '../types.js';

export function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    async chat(messages: LLMMessage[]): Promise<string> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5-20251001',
          max_tokens: 4096,
          messages: messages.filter(m => m.role !== 'system'),
          system: messages.find(m => m.role === 'system')?.content,
        }),
      });
      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
      }
      const data = await response.json() as any;
      return data.content[0].text;
    },
  };
}

export function createMockProvider(responses: string[]): LLMProvider & { calls: LLMMessage[][] } {
  let index = 0;
  const calls: LLMMessage[][] = [];
  return {
    calls,
    async chat(messages: LLMMessage[]): Promise<string> {
      calls.push([...messages]);
      const response = responses[index % responses.length];
      index++;
      return response;
    },
  };
}
