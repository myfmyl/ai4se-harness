import { HarnessEngine } from '../core/state-machine.js';
import { createAnthropicProvider } from '../core/llm-provider.js';
import { loadConfig } from '../config/loader.js';
import { saveCredential, getCredential, deleteCredential, checkCredentialStatus, maskKey } from '../credentials/keychain.js';
import { MemoryStore } from '../memory/store.js';

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args = argv.slice(2);
  if (args.length === 0) return { command: 'help' };

  const result: Record<string, string | boolean> = { command: args[0] };

  switch (args[0]) {
    case 'run':
      result.args = args.slice(1).join(' ');
      break;
    case 'setup':
      result.force = args.includes('--force');
      break;
    case 'config':
      result.showKeyStatus = args.includes('--show-key-status');
      result.clearKey = args.includes('--clear-key');
      break;
    case 'remember':
      result.args = args.slice(1).join(' ');
      break;
    case 'serve':
      const portIdx = args.indexOf('--port');
      result.port = portIdx !== -1 ? args[portIdx + 1] : '3000';
      break;
    default:
      result.command = 'help';
  }

  return result;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  switch (parsed.command) {
    case 'run': {
      const apiKey = await getCredential('ai4se-harness', 'anthropic-api-key');
      if (!apiKey) {
        console.error('No API key found. Run "harness setup" first.');
        process.exit(1);
      }
      const config = loadConfig();
      const llm = createAnthropicProvider(apiKey);
      const engine = new HarnessEngine(llm, config, {
        workspaceRoot: config.tools.workspaceRoot,
        onTransition: (t) => console.log(`[${t.from} → ${t.to}] ${t.action?.type || ''} ${t.metadata?.reason || ''}`),
      });
      const history = await engine.run(String(parsed.args));
      const last = history[history.length - 1];
      console.log(`\nTask ${last.metadata?.success ? 'completed successfully' : 'failed'}: ${last.metadata?.reason}`);
      break;
    }
    case 'setup': {
      const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      readline.question('Enter your Anthropic API key: ', async (key: string) => {
        readline.close();
        if (!key.startsWith('sk-ant-')) {
          console.error('Invalid API key format. Should start with sk-ant-');
          process.exit(1);
        }
        await saveCredential('ai4se-harness', 'anthropic-api-key', key.trim());
        console.log('API key saved to Keychain ✓');
      });
      break;
    }
    case 'config': {
      if (parsed.clearKey) {
        await deleteCredential('ai4se-harness', 'anthropic-api-key');
        console.log('API key removed');
      }
      if (parsed.showKeyStatus) {
        const status = await checkCredentialStatus('ai4se-harness', 'anthropic-api-key');
        if (status === 'stored') {
          const key = await getCredential('ai4se-harness', 'anthropic-api-key');
          console.log(`API key: ${maskKey(key!)} (stored in Keychain)`);
        } else {
          console.log('No API key stored');
        }
      }
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
      break;
    }
    case 'remember': {
      const store = new MemoryStore();
      await store.save(process.cwd(), {
        id: Date.now().toString(),
        type: 'fact',
        content: String(parsed.args),
        tags: [],
        createdAt: new Date().toISOString(),
      });
      console.log('Remembered.');
      break;
    }
    case 'help':
    default:
      console.log(`Usage: harness <command>

Commands:
  run <task>       Run the agent on a task
  setup            Configure API key (stored in Keychain)
  config           View/update configuration
  remember <fact>  Save a project memory
  serve            Start Web UI server`);
  }
}

main().catch(console.error);
