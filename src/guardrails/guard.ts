import { resolve, normalize } from 'path';

export interface GuardResult {
  safe: boolean;
  reason?: string;
}

export function isDangerous(command: string, blockedPatterns: string[]): { dangerous: boolean; reason?: string } {
  if (!command || command.trim() === '') return { dangerous: false };
  const normalized = command.trim().replace(/\s+/g, ' ');
  const rmDangerous = /\brm\b.*(?:-r|--recursive|--force|-f).*(?:-f|--force|-r|--recursive)/i;
  if (rmDangerous.test(normalized)) {
    return { dangerous: true, reason: 'Dangerous recursive force delete detected' };
  }
  for (const pattern of blockedPatterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalized)) {
        return { dangerous: true, reason: `Command matches blocked pattern: ${pattern}` };
      }
    } catch {
      if (normalized.toLowerCase().includes(pattern.toLowerCase())) {
        return { dangerous: true, reason: `Command contains blocked string: ${pattern}` };
      }
    }
  }
  return { dangerous: false };
}

export function checkPath(targetPath: string, workspaceRoot: string): GuardResult {
  const resolved = resolve(workspaceRoot, normalize(targetPath));
  const root = resolve(workspaceRoot);
  if (!resolved.startsWith(root + '/') && resolved !== root) {
    return { safe: false, reason: `Path "${targetPath}" resolves outside workspace` };
  }
  return { safe: true };
}

export function checkCommand(
  command: string,
  allowedCommands: string[],
  blockedPatterns: string[],
): GuardResult {
  const base = command.trim().split(/\s+/)[0];
  if (allowedCommands.length > 0 && !allowedCommands.includes(base)) {
    return { safe: false, reason: `Command "${base}" is not in the allowed list` };
  }
  const danger = isDangerous(command, blockedPatterns);
  if (danger.dangerous) {
    return { safe: false, reason: danger.reason };
  }
  return { safe: true };
}
