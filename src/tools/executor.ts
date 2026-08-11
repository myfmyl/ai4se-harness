import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import type { Action, ToolResult } from '../types.js';

export async function executeTool(
  action: Action,
  workspaceRoot: string,
  testCommand?: string,
  lintCommand?: string,
): Promise<ToolResult> {
  const start = Date.now();
  try {
    switch (action.type) {
      case 'read_file': {
        const path = resolve(workspaceRoot, String(action.params.path || ''));
        if (!path.startsWith(resolve(workspaceRoot) + '/') && path !== resolve(workspaceRoot)) {
          return { toolType: 'read_file', success: false, stdout: '', stderr: `Path "${action.params.path}" is outside workspace`, exitCode: 1, duration: Date.now() - start };
        }
        try {
          const content = readFileSync(path, 'utf-8');
          return { toolType: 'read_file', success: true, stdout: content, stderr: '', exitCode: 0, duration: Date.now() - start };
        } catch (e: any) {
          return { toolType: 'read_file', success: false, stdout: '', stderr: `Cannot read file: ${e.message}`, exitCode: 1, duration: Date.now() - start };
        }
      }
      case 'write_file': {
        const path = resolve(workspaceRoot, String(action.params.path || ''));
        if (!path.startsWith(resolve(workspaceRoot) + '/') && path !== resolve(workspaceRoot)) {
          return { toolType: 'write_file', success: false, stdout: '', stderr: `Path "${action.params.path}" is outside workspace`, exitCode: 1, duration: Date.now() - start };
        }
        writeFileSync(path, String(action.params.content || ''));
        return { toolType: 'write_file', success: true, stdout: `Wrote ${String(action.params.content || '').length} bytes to ${action.params.path}`, stderr: '', exitCode: 0, duration: Date.now() - start };
      }
      case 'run_shell': {
        const command = String(action.params.command || '');
        const cwd = action.params.cwd ? resolve(workspaceRoot, String(action.params.cwd)) : workspaceRoot;
        try {
          const stdout = execSync(command, { cwd, timeout: 30000, encoding: 'utf-8' });
          return { toolType: 'run_shell', success: true, stdout, stderr: '', exitCode: 0, duration: Date.now() - start };
        } catch (e: any) {
          return { toolType: 'run_shell', success: false, stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1, duration: Date.now() - start };
        }
      }
      case 'run_test': {
        const cmd = testCommand || 'npm test';
        try {
          const stdout = execSync(cmd, { cwd: workspaceRoot, timeout: 60000, encoding: 'utf-8' });
          return { toolType: 'run_test', success: true, stdout, stderr: '', exitCode: 0, duration: Date.now() - start };
        } catch (e: any) {
          return { toolType: 'run_test', success: false, stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1, duration: Date.now() - start };
        }
      }
      case 'run_lint': {
        const cmd = lintCommand || 'npm run lint';
        try {
          const stdout = execSync(cmd, { cwd: workspaceRoot, timeout: 60000, encoding: 'utf-8' });
          return { toolType: 'run_lint', success: true, stdout, stderr: '', exitCode: 0, duration: Date.now() - start };
        } catch (e: any) {
          return { toolType: 'run_lint', success: false, stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1, duration: Date.now() - start };
        }
      }
      case 'task_complete':
        return { toolType: 'task_complete', success: true, stdout: String(action.params.summary || 'Task completed'), stderr: '', exitCode: 0, duration: Date.now() - start };
      default:
        return { toolType: 'unknown', success: false, stdout: '', stderr: `Unknown tool: ${action.type}`, exitCode: 1, duration: Date.now() - start };
    }
  } catch (e: any) {
    return { toolType: action.type, success: false, stdout: '', stderr: `Tool execution error: ${e.message}`, exitCode: 1, duration: Date.now() - start };
  }
}
