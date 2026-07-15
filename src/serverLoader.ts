import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Server, mapRecord } from './types';

const LINUX_KEYWORDS = ['linux', 'suse', 'rhel', 'ubuntu', 'debian', 'centos', 'amazon'];

function isLinux(server: Server): boolean {
  const cls = server.serverClass.toLowerCase();
  const os = server.osVersion.toLowerCase();
  if (cls.includes('windows') || os.includes('windows')) return false;
  // Accept if class contains "linux" or known Linux OS keywords, or if it's a generic "server"
  return (
    LINUX_KEYWORDS.some((k) => cls.includes(k) || os.includes(k)) ||
    cls.includes('server')
  );
}

export async function pickAndLoadFile(): Promise<{ filePath: string; servers: Server[] } | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { 'JSON Files': ['json'] },
    title: 'Select MAL JSON file',
  });

  if (!uris || uris.length === 0) return undefined;

  const filePath = uris[0].fsPath;
  const servers = await loadFile(filePath);
  return { filePath, servers };
}

export async function loadFile(filePath: string): Promise<Server[]> {
  const raw = await fs.readFile(filePath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: Record<string, any>[] = JSON.parse(raw);

  if (!Array.isArray(records)) {
    throw new Error('JSON file must contain an array of server records');
  }

  return records
    .map(mapRecord)
    .filter((s) => s.hostname && s.privateIp && isLinux(s));
}
