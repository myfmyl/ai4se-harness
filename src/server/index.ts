import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { join } from 'path';
import { HarnessEngine } from '../core/state-machine.js';
import { createAnthropicProvider } from '../core/llm-provider.js';
import { loadConfig } from '../config/loader.js';
import { getCredential } from '../credentials/keychain.js';
import type { StateTransition } from '../types.js';

export async function startServer(port: number = 3000): Promise<void> {
  const app = express();
  const http = createServer(app);
  const io = new Server(http);

  app.use(express.static(join(__dirname, 'public')));

  // Store active engine per socket for HITL approval flow
  const engines = new Map<string, HarnessEngine>();

  io.on('connection', (socket: Socket) => {
    console.log('Client connected');

    socket.on('disconnect', () => {
      engines.delete(socket.id);
    });

    socket.on('run-task', async (task: string, callback: (response: { success: boolean; reason: string; history: StateTransition[] }) => void) => {
      try {
        const apiKey = await getCredential('ai4se-harness', 'anthropic-api-key');
        if (!apiKey) {
          callback({ success: false, reason: 'No API key. Run "harness setup" first.', history: [] });
          return;
        }

        const config = loadConfig();
        const llm = createAnthropicProvider(apiKey);
        const engine = new HarnessEngine(llm, config, {
          workspaceRoot: config.tools.workspaceRoot,
          onTransition: (t: StateTransition) => {
            socket.emit('transition', t);
          },
        });

        engines.set(socket.id, engine);

        socket.emit('status', { state: 'IDLE', message: `Starting task: ${task}` });

        // Run loop with HITL support — continues across WAITING_APPROVAL pauses
        let history = await engine.run(task);

        while (engine.getState() === 'WAITING_APPROVAL') {
          // Wait for the user to approve or reject
          const decision = await new Promise<'approve' | 'reject'>((resolve) => {
            const onApprove = () => {
              socket.off('reject', onReject);
              resolve('approve');
            };
            const onReject = () => {
              socket.off('approve', onApprove);
              resolve('reject');
            };
            socket.once('approve', onApprove);
            socket.once('reject', onReject);
          });

          if (decision === 'approve') {
            engine.approve();
          } else {
            engine.reject();
          }

          history = await engine.resumeRun(task);
        }

        engines.delete(socket.id);

        const last = history[history.length - 1];
        callback({
          success: !!last.metadata?.success,
          reason: String(last.metadata?.reason || ''),
          history,
        });
      } catch (e: any) {
        engines.delete(socket.id);
        callback({ success: false, reason: e.message, history: [] });
      }
    });

    // approve/reject events are handled by the promise-based wait in run-task above
    // These handlers are kept for logging / fallback
    socket.on('approve', () => {
      socket.emit('status', { state: 'WAITING_APPROVAL', message: 'Approval received, executing...' });
    });

    socket.on('reject', () => {
      socket.emit('status', { state: 'WAITING_APPROVAL', message: 'Command rejected, rethinking...' });
    });
  });

  http.listen(port, () => {
    console.log(`Harness Web UI running at http://localhost:${port}`);
  });
}

// Run if called directly (e.g., node dist/server/index.js or tsx src/server/index.ts)
const isMain = process.argv[1]?.includes('index.js') || process.argv[1]?.includes('index.ts');
if (isMain) {
  const port = parseInt(process.env.PORT || '3000');
  startServer(port).catch(console.error);
}
