import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Server, mapRecord } from './types';
import * as XLSX from 'xlsx';

export async function pickAndLoadFile(): Promise<{ filePath: string; servers: Server[] } | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    filters: {
      'Asset Lists': ['json', 'xlsx'],
      'JSON': ['json'],
      'Excel': ['xlsx'],
    },
    title: 'Select MAL file (JSON or Excel)',
  });

  if (!uris || uris.length === 0) return undefined;

  const filePath = uris[0].fsPath;
  const servers = await loadFile(filePath);
  return { filePath, servers };
}

export async function loadFile(filePath: string, xlsxSheet?: string): Promise<Server[]> {
  if (filePath.toLowerCase().endsWith('.xlsx')) {
    return loadXlsxFile(filePath, xlsxSheet);
  }
  return loadJsonFile(filePath);
}

async function loadJsonFile(filePath: string): Promise<Server[]> {
  const raw = await fs.readFile(filePath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: Record<string, any>[] = JSON.parse(raw);
  if (!Array.isArray(records)) {
    throw new Error('JSON file must contain an array of server records');
  }
  return records.map(mapRecord).filter((s) => s.hostname && s.privateIp);
}

export async function getXlsxSheets(filePath: string): Promise<string[]> {
  const buf = await fs.readFile(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  return wb.SheetNames;
}

async function loadXlsxFile(filePath: string, sheetName?: string): Promise<Server[]> {
  const buf = await fs.readFile(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });

  let sheet = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : undefined;

  if (!sheet) {
    if (wb.SheetNames.length === 1) {
      sheet = wb.SheetNames[0];
    } else {
      const picked = await vscode.window.showQuickPick(
        wb.SheetNames.map((name) => ({ label: name })),
        { title: 'Select Sheet to Load', placeHolder: 'Choose which sheet contains the server list' }
      );
      if (!picked) return [];
      sheet = picked.label;
    }
  }

  const wsData = wb.Sheets[sheet];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: Record<string, any>[] = XLSX.utils.sheet_to_json(wsData, { defval: '' });

  return records.map(mapRecord).filter((s) => s.hostname && s.privateIp);
}
