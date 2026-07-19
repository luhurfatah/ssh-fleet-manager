import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ProjectManager } from './projectManager';
import { ExcludeRule, FIELD_DEFS, FieldMapping, GROUPABLE_FIELDS, GroupBy, Server } from './types';
import { loadFile, getXlsxSheets } from './serverLoader';

const TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'hostname',     label: 'Hostname' },
  { key: 'privateIp',    label: 'IP Address' },
  { key: 'fqdn',         label: 'FQDN' },
  { key: 'os',           label: 'OS' },
  { key: 'status',       label: 'Status' },
  { key: 'company',      label: 'Company' },
  { key: 'sbu',          label: 'SBU' },
  { key: 'generalRole',  label: 'Role' },
  { key: 'serverClass',  label: 'Server Class' },
  { key: 'application',  label: 'Application' },
  { key: 'accountName',  label: 'Account' },
  { key: 'accountId',    label: 'Account ID' },
  { key: 'owner',        label: 'Owner' },
  { key: 'instanceType', label: 'Instance Type' },
  { key: 'osVersion',    label: 'OS Version' },
  { key: 'instanceId',   label: 'Instance ID' },
];

const FILTER_ROWS: {
  fkey: string;
  label: string;
  groupByKey?: string;
  distinctKey?: string;
  staticOpts?: string[];
}[] = [
  { fkey: 'os',          label: 'OS',           staticOpts: ['linux', 'windows'] },
  { fkey: 'status',      label: 'Status',       groupByKey: 'status' },
  { fkey: 'company',     label: 'Company',      groupByKey: 'company' },
  { fkey: 'application', label: 'Application',  groupByKey: 'application' },
  { fkey: 'sbu',         label: 'SBU',          groupByKey: 'sbu' },
  { fkey: 'role',        label: 'General Role', groupByKey: 'generalRole' },
  { fkey: 'serverClass', label: 'Server Class', groupByKey: 'serverClass' },
  { fkey: 'account',     label: 'Account',      groupByKey: 'accountName' },
  { fkey: 'owner',       label: 'Owner',        groupByKey: 'owner' },
];

const openPanels = new Map<string, vscode.WebviewPanel>();

interface DistinctValuesResult {
  distinctValues: Record<string, string[]>;
  extraColumnKeys: string[];
}

async function computeDistinctValues(
  jsonFilePath: string | undefined,
  xlsxSheet?: string
): Promise<DistinctValuesResult> {
  if (!jsonFilePath) return { distinctValues: {}, extraColumnKeys: [] };
  try {
    const servers = await loadFile(jsonFilePath, xlsxSheet);
    const distinctValues: Record<string, string[]> = {};
    for (const f of GROUPABLE_FIELDS) {
      const values = new Set<string>();
      for (const s of servers) {
        const v = s[f.value as keyof Server];
        if (v) values.add(String(v));
      }
      distinctValues[f.value] = Array.from(values).sort((a, b) => a.localeCompare(b));
    }
    // Build a deny-list of every column name that belongs to a predefined field
    const knownCols = new Set<string>(FIELD_DEFS.flatMap((f) => f.defaults));
    const extraKeySet = new Set<string>();
    for (const s of servers) {
      Object.keys(s.extras).forEach((k) => {
        if (!knownCols.has(k)) extraKeySet.add(k);
      });
    }
    const extraColumnKeys = Array.from(extraKeySet).sort();
    return { distinctValues, extraColumnKeys };
  } catch {
    return { distinctValues: {}, extraColumnKeys: [] };
  }
}

export async function openProjectDetailsPanel(
  pm: ProjectManager,
  projectId: string,
  onSaved: () => void
): Promise<void> {
  const existing = openPanels.get(projectId);
  if (existing) {
    existing.reveal();
    return;
  }

  const project = pm.projects.find((p) => p.id === projectId);
  if (!project) return;

  const panel = vscode.window.createWebviewPanel(
    'sshFleetManagerProjectDetails',
    `Project: ${project.name}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.iconPath = new vscode.ThemeIcon('settings-gear');
  openPanels.set(projectId, panel);
  panel.onDidDispose(() => openPanels.delete(projectId));

  const hasPassword = !!(await pm.getPassword(projectId));
  const { distinctValues: distinctValuesByField, extraColumnKeys } = await computeDistinctValues(
    project.jsonFilePath,
    project.xlsxSheet
  );
  const xlsxSheets = project.jsonFilePath?.toLowerCase().endsWith('.xlsx')
    ? await getXlsxSheets(project.jsonFilePath).catch(() => [] as string[])
    : [];

  panel.webview.html = getHtml(crypto.randomBytes(16).toString('hex'), {
    name: project.name,
    jsonFilePath: project.jsonFilePath ?? '',
    xlsxSheet: project.xlsxSheet ?? '',
    xlsxSheets,
    username: project.credentials.username ?? '',
    sshKeyPath: project.credentials.sshKeyPath ?? '',
    rdpUsername: project.credentials.rdpUsername ?? '',
    rdpDomain: project.credentials.rdpDomain ?? '',
    groupBy: project.groupBy ?? '',
    defaultFilterFields: project.defaultFilterFields ?? [],
    defaultFilterValues: project.defaultFilterValues ?? {} as Record<string, string[]>,
    tableColumns: project.tableColumns ?? [],
    fieldMapping: project.fieldMapping ?? {},
    excludeRules: project.excludeRules ?? [],
    distinctValuesByField,
    extraColumnKeys,
    hasPassword,
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'browseJson') {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Asset Lists': ['json', 'xlsx'], 'JSON': ['json'], 'Excel': ['xlsx'] },
        title: 'Select asset file (JSON or Excel)',
      });
      if (uris?.[0]) {
        const filePath = uris[0].fsPath;
        let sheets: string[] = [];
        if (filePath.toLowerCase().endsWith('.xlsx')) {
          sheets = await getXlsxSheets(filePath).catch(() => []);
        }
        // Send sheets to webview — sheet selection happens inside the panel
        panel.webview.postMessage({ type: 'setJsonFilePath', value: filePath, sheets });
        // Distinct values will be reloaded after user selects a sheet via 'loadDistinctValues'
      }
      return;
    }

    if (msg.type === 'loadDistinctValues') {
      const { distinctValues, extraColumnKeys: extraKeys } = await computeDistinctValues(
        msg.filePath,
        msg.sheet || undefined
      );
      panel.webview.postMessage({ type: 'setDistinctValues', value: distinctValues, extraColumnKeys: extraKeys });
      return;
    }

    if (msg.type === 'browseKey') {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        title: 'Select SSH private key file',
      });
      if (uris?.[0]) panel.webview.postMessage({ type: 'setKeyPath', value: uris[0].fsPath });
      return;
    }

    if (msg.type === 'cancel') {
      panel.dispose();
      return;
    }

    if (msg.type === 'deleteProject') {
      const choice = await vscode.window.showWarningMessage(
        `Delete project "${project.name}"? This cannot be undone.`,
        { modal: true },
        'Delete'
      );
      if (choice !== 'Delete') return;
      panel.dispose();
      await pm.deleteProject(projectId);
      onSaved();
      vscode.window.showInformationMessage(`Project "${project.name}" deleted.`);
      return;
    }

    if (msg.type === 'save') {
      const name = (msg.name ?? '').trim();
      if (!name) {
        panel.webview.postMessage({ type: 'error', message: 'Project name cannot be empty' });
        return;
      }

      await pm.renameProject(projectId, name);
      await pm.updateJsonFilePath(
        projectId,
        (msg.jsonFilePath ?? '').trim(),
        (msg.xlsxSheet ?? '').trim() || undefined
      );
      await pm.setGroupBy(projectId, (msg.groupBy || undefined) as GroupBy | undefined);
      await pm.setDefaultFilterFields(
        projectId,
        Array.isArray(msg.defaultFilterFields)
          ? (msg.defaultFilterFields as string[]).filter(Boolean)
          : []
      );
      await pm.setDefaultFilterValues(
        projectId,
        typeof msg.defaultFilterValues === 'object' && msg.defaultFilterValues
          ? (msg.defaultFilterValues as Record<string, string[]>)
          : {}
      );
      await pm.setTableColumns(
        projectId,
        Array.isArray(msg.tableColumns) ? (msg.tableColumns as string[]).filter(Boolean) : []
      );
      await pm.setFieldMapping(
        projectId,
        typeof msg.fieldMapping === 'object' && msg.fieldMapping
          ? (msg.fieldMapping as FieldMapping)
          : {}
      );

      const excludeRules: ExcludeRule[] = Array.isArray(msg.excludeRules)
        ? msg.excludeRules.filter(
            (r: unknown): r is ExcludeRule =>
              !!r &&
              typeof (r as ExcludeRule).field === 'string' &&
              typeof (r as ExcludeRule).value === 'string' &&
              (r as ExcludeRule).value.length > 0
          )
        : [];
      await pm.setExcludeRules(projectId, excludeRules);

      let password: string | undefined;
      if (msg.clearPassword) password = '';
      else if (msg.password) password = msg.password;

      await pm.setCredentials(
        projectId,
        {
          username: (msg.username ?? '').trim() || undefined,
          sshKeyPath: (msg.sshKeyPath ?? '').trim() || undefined,
          rdpUsername: (msg.rdpUsername ?? '').trim() || undefined,
          rdpDomain: (msg.rdpDomain ?? '').trim() || undefined,
        },
        password
      );

      panel.title = `Project: ${name}`;
      panel.webview.postMessage({ type: 'saved' });
      onSaved();
      vscode.window.showInformationMessage(`Project "${name}" saved.`);
    }
  });
}

interface ProjectFormData {
  name: string;
  jsonFilePath: string;
  xlsxSheet: string;
  xlsxSheets: string[];
  username: string;
  sshKeyPath: string;
  rdpUsername: string;
  rdpDomain: string;
  groupBy: string;
  defaultFilterFields: string[];
  defaultFilterValues: Record<string, string[]>;
  tableColumns: string[];
  fieldMapping: FieldMapping;
  excludeRules: ExcludeRule[];
  distinctValuesByField: Record<string, string[]>;
  extraColumnKeys: string[];
  hasPassword: boolean;
}

function getHtml(nonce: string, data: ProjectFormData): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  const groupByOptions = GROUPABLE_FIELDS.map(
    (f) => `<option value="${f.value}"${f.value === data.groupBy ? ' selected' : ''}>${f.label}</option>`
  ).join('');

  const excludeFieldOptions = GROUPABLE_FIELDS.map(
    (f) => `<option value="${f.value}">${f.label}</option>`
  ).join('');

  const fieldMappingRows = FIELD_DEFS.map(
    (f) => `
    <div class="mapping-row">
      <div>
        <div class="mapping-label">${f.label}</div>
        <div class="mapping-default">Default: ${f.defaults.join(', ')}</div>
      </div>
      <input type="text" data-mapping-key="${f.key}"
        value="${esc(data.fieldMapping[f.key] ?? '')}"
        placeholder="${esc(f.defaults[0])}" />
    </div>`
  ).join('');

  const sheetOptions = data.xlsxSheets
    .map((s) => `<option value="${esc(s)}"${s === data.xlsxSheet ? ' selected' : ''}>${esc(s)}</option>`)
    .join('');

  const filterTableRows = FILTER_ROWS.map((fr) => {
    const visKey = fr.groupByKey ?? fr.fkey;
    const isChecked = data.defaultFilterFields.includes(visKey);
    return `
    <div class="filter-table-row">
      <span class="filter-table-label">${fr.label}</span>
      <span class="filter-table-vis">
        <input type="checkbox" name="defaultFilterFields" value="${visKey}"${isChecked ? ' checked' : ''} />
      </span>
      <span><div id="cl-${fr.fkey}" class="cl-root"></div></span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.5;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Sticky top bar ──────────────────────────────────── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 28px;
    height: 52px;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    flex-wrap: wrap;
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .topbar-icon {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--vscode-button-background);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .topbar-title {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .topbar-subtitle {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }
  .saved-badge {
    font-size: 12px;
    color: var(--vscode-charts-green, #4caf50);
    display: none;
    align-items: center;
    gap: 4px;
  }
  .error-msg {
    font-size: 12px;
    color: var(--vscode-errorForeground);
    display: none;
  }

  /* ── Main tab navigation ─────────────────────────────── */
  .main-tab-nav {
    position: sticky;
    top: 52px;
    z-index: 9;
    display: flex;
    padding: 0 28px;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    flex: 0 0 auto;
    overflow-x: auto;
  }
  .main-tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 10px 18px 8px;
    font-size: 12px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 0.1s, border-color 0.1s;
    white-space: nowrap;
  }
  .main-tab-btn:hover { color: var(--vscode-foreground); background: none; }
  .main-tab-btn.active {
    color: var(--vscode-foreground);
    font-weight: 600;
    border-bottom-color: var(--vscode-button-background, var(--vscode-focusBorder, #007acc));
  }
  .main-tab-panel { display: none; flex-direction: column; gap: 14px; }
  .main-tab-panel.active { display: flex; }

  /* ── Buttons ─────────────────────────────────────────── */
  button {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1;
    transition: background 0.12s, opacity 0.12s;
    white-space: nowrap;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-weight: 500;
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-ghost {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
  }
  .btn-ghost:hover { background: var(--vscode-list-hoverBackground); }
  .btn-danger {
    background: transparent;
    color: var(--vscode-errorForeground, #f44);
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground, #f44) 50%, transparent);
  }
  .btn-danger:hover { background: rgba(255,60,60,0.08); }
  .btn-sm { font-size: 12px; padding: 5px 10px; }
  .btn-icon {
    background: none;
    border: none;
    padding: 2px 5px;
    border-radius: 3px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  .btn-icon:hover {
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-foreground);
  }

  /* ── Content area ────────────────────────────────────── */
  .content {
    padding: 20px 28px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 1000px;
    flex: 1;
  }

  /* ── Two-column grid ─────────────────────────────────── */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  @media (max-width: 620px) {
    .grid-2 { grid-template-columns: 1fr; }
  }

  /* ── Cards ───────────────────────────────────────────── */
  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 8px;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.04));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  }
  .card-header-icon {
    font-size: 14px;
    opacity: 0.75;
    flex: 0 0 auto;
  }
  .card-header-text { font-size: 12px; font-weight: 600; }
  .card-header-actions { margin-left: auto; display: flex; gap: 4px; }
  .card-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }

  /* ── Form fields ─────────────────────────────────────── */
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }
  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }
  .field-desc { font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.4; }
  .input-row { display: flex; gap: 6px; align-items: stretch; }
  .input-row input { flex: 1; min-width: 0; }

  input[type="text"], input[type="password"] {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    border-radius: 4px;
    padding: 7px 10px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    width: 100%;
    transition: border-color 0.1s, box-shadow 0.1s;
  }
  input:focus {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
  }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  input:disabled { opacity: 0.45; cursor: not-allowed; }

  select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,0.3));
    border-radius: 4px;
    padding: 7px 10px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    width: 100%;
    transition: border-color 0.1s;
  }
  select:focus { border-color: var(--vscode-focusBorder); }

  /* ── Credential sub-tabs ────────────────────────────── */
  .tab-bar {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    padding: 0 16px;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.04));
  }
  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 9px 14px 7px;
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 0.1s, border-color 0.1s;
    gap: 5px;
  }
  .tab-btn:hover { color: var(--vscode-foreground); background: none; }
  .tab-btn.active {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-button-background, var(--vscode-focusBorder));
  }
  .tab-pane { display: none; }
  .tab-pane.active { display: flex; flex-direction: column; gap: 14px; }

  /* ── Exclude rules ───────────────────────────────────── */
  .rules-wrap { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
  .rule-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--vscode-badge-background, rgba(128,128,128,0.1));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 100px;
    padding: 3px 8px 3px 10px;
    font-size: 12px;
    white-space: nowrap;
  }
  .rule-chip .field-tag {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    opacity: 0.6;
  }
  .rules-empty {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    padding: 6px 0;
  }
  .add-rule {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .add-rule select { flex: 0 0 auto; width: auto; max-width: 160px; }
  .add-rule input { flex: 1; min-width: 120px; }

  /* ── Checkbox ────────────────────────────────────────── */
  .checkbox-row { display: flex; align-items: center; gap: 8px; }
  .checkbox-row label { font-size: 12px; cursor: pointer; }
  input[type="checkbox"] { cursor: pointer; width: 14px; height: 14px; flex: 0 0 auto; accent-color: var(--vscode-button-background); }

  /* ── Filter field checkboxes ─────────────────────────── */
  .filter-checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 4px 12px;
    margin-top: 6px;
  }
  .filter-check-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    padding: 3px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .filter-check-item input[type="checkbox"] { flex: 0 0 auto; }

  /* ── Column selector ────────────────────────────────── */
  .col-checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 4px 12px;
    margin-top: 6px;
  }
  .col-checks-actions { display: flex; gap: 6px; margin-top: 4px; }

  /* ── Filter default-value table ──────────────────────── */
  .filter-table {
    margin-top: 8px;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 6px;
    overflow: hidden;
  }
  .filter-table-head, .filter-table-row {
    display: grid;
    grid-template-columns: 130px 60px 1fr;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
  }
  .filter-table-head {
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.06));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
  }
  .filter-table-row { border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.07)); }
  .filter-table-row:last-child { border-bottom: none; }
  .filter-table-label { font-size: 12px; }
  .filter-table-vis { display: flex; justify-content: center; }

  /* ── Checklist dropdown ──────────────────────────────── */
  .cl-root { position: relative; }
  .cl-btn {
    width: 100%;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,0.3));
    border-radius: 4px;
    padding: 5px 10px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.1s;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .cl-btn:hover { background: var(--vscode-list-hoverBackground); }
  .cl-btn.open { border-color: var(--vscode-focusBorder, #007acc); }
  .cl-btn.has-values { border-color: var(--vscode-focusBorder, #007acc); color: var(--vscode-focusBorder, #007acc); }
  .cl-btn-caret { opacity: 0.5; font-size: 10px; flex: 0 0 auto; }
  .cl-panel {
    display: none;
    position: fixed;
    z-index: 500;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    min-width: 200px;
    max-height: 220px;
    overflow-y: auto;
  }
  .cl-panel.open { display: block; }
  .cl-actions { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2)); }
  .cl-clear {
    font-family: var(--vscode-font-family);
    font-size: 11px;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    cursor: pointer;
    color: var(--vscode-foreground);
    border-radius: 3px;
  }
  .cl-clear:hover { background: var(--vscode-list-hoverBackground); }
  .cl-option {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    user-select: none;
  }
  .cl-option:hover { background: var(--vscode-list-hoverBackground); }
  .cl-option input[type=checkbox] { cursor: pointer; flex: 0 0 auto; }
  .cl-empty { padding: 10px 12px; font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic; }

  /* ── Field mapping table ─────────────────────────────── */
  .mapping-table { display: flex; flex-direction: column; gap: 6px; }
  .mapping-row {
    display: grid;
    grid-template-columns: 160px 1fr;
    align-items: center;
    gap: 10px;
  }
  .mapping-label { font-size: 12px; color: var(--vscode-foreground); }
  .mapping-default { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 1px; }

  /* ── Danger zone ─────────────────────────────────────── */
  .card.danger { border-color: color-mix(in srgb, var(--vscode-errorForeground, #f44) 35%, transparent); }
  .card.danger .card-header { background: color-mix(in srgb, var(--vscode-errorForeground, #f44) 6%, transparent); }
  .card.danger .card-header-text { color: var(--vscode-errorForeground, #f44); }
  .danger-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }

  /* ── File path display ───────────────────────────────── */
  .filepath-display {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    word-break: break-all;
    padding: 4px 0;
  }
  .filepath-display:empty { display: none; }
</style>
</head>
<body>

<!-- Sticky top bar -->
<div class="topbar">
  <div class="topbar-left">
    <div class="topbar-icon">&#9881;</div>
    <div>
      <div class="topbar-title" id="heroName">${esc(data.name)}</div>
      <div class="topbar-subtitle">Project Settings</div>
    </div>
  </div>
  <div class="topbar-right">
    <span class="saved-badge" id="savedBadge">&#10003; Saved</span>
    <span class="error-msg" id="nameError"></span>
    <button class="btn-ghost btn-sm" id="cancel">Discard</button>
    <button class="btn-primary" id="save">Save Changes</button>
  </div>
</div>

<!-- Main tab navigation -->
<div class="main-tab-nav">
  <button class="main-tab-btn active" data-main-tab="general">General</button>
  <button class="main-tab-btn" data-main-tab="asset-table">Asset Table</button>
  <button class="main-tab-btn" data-main-tab="credentials">Credentials</button>
  <button class="main-tab-btn" data-main-tab="data-rules">Data Rules</button>
</div>

<div class="content">

  <!-- ── General tab ──────────────────────────────────── -->
  <div class="main-tab-panel active" id="main-tab-panel-general">

    <div class="grid-2">

      <div class="card">
        <div class="card-header">
          <span class="card-header-icon">&#128196;</span>
          <span class="card-header-text">General</span>
        </div>
        <div class="card-body">
          <div class="field">
            <label class="field-label" for="name">Project Name</label>
            <input type="text" id="name" value="${esc(data.name)}" placeholder="e.g. Production, Staging" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-header-icon">&#128194;</span>
          <span class="card-header-text">Data Source</span>
        </div>
        <div class="card-body">
          <div class="field">
            <label class="field-label" for="jsonFilePath">Asset File</label>
            <div class="input-row">
              <input type="text" id="jsonFilePath" value="${esc(data.jsonFilePath)}" placeholder="No file selected" readonly style="cursor:default;font-size:12px;" />
              <button class="btn-ghost btn-sm" id="browseJson">Browse&hellip;</button>
            </div>
          </div>
          <div class="field" id="sheetRow" style="display:${data.xlsxSheets.length > 0 ? 'flex' : 'none'};">
            <label class="field-label" for="xlsxSheet">Sheet</label>
            <select id="xlsxSheet">
              ${sheetOptions}
            </select>
          </div>
        </div>
      </div>

    </div>

    <div class="card danger">
      <div class="card-header">
        <span class="card-header-icon">&#9888;</span>
        <span class="card-header-text">Danger Zone</span>
      </div>
      <div class="card-body">
        <div class="danger-row">
          <div>
            <div style="font-weight:500;margin-bottom:3px;">Delete this project</div>
            <div class="field-desc">Removes the project and its stored credentials. The asset file on disk is not affected.</div>
          </div>
          <button class="btn-danger btn-sm" id="btnDeleteProject">Delete Project</button>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Asset Table tab ──────────────────────────────── -->
  <div class="main-tab-panel" id="main-tab-panel-asset-table">

    <div class="card">
      <div class="card-header">
        <span class="card-header-icon">&#128065;</span>
        <span class="card-header-text">Display Settings</span>
      </div>
      <div class="card-body">

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="groupBy">Group Servers By</label>
            <div class="field-desc">Sidebar grouping for the Servers pane.</div>
            <select id="groupBy">
              <option value="">(Use global default)</option>
              ${groupByOptions}
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Visible Columns</label>
          <div class="field-desc">Choose which columns appear in the Asset Table. When nothing is configured all columns are shown.</div>
          <div class="col-checks-actions">
            <button type="button" class="btn-ghost btn-sm" id="btnCheckAllCols">Select All</button>
            <button type="button" class="btn-ghost btn-sm" id="btnUncheckAllCols">Clear</button>
          </div>
          <div class="col-checks" id="predefinedColChecks">
            ${TABLE_COLUMNS.map((col) => `
            <label class="filter-check-item">
              <input type="checkbox" name="tableColumn" value="${col.key}"${
                data.tableColumns.length === 0 || data.tableColumns.includes(col.key) ? ' checked' : ''
              } />
              ${col.label}
            </label>`).join('')}
          </div>
          <div id="extraColsSection" style="display:${data.extraColumnKeys.length > 0 ? 'block' : 'none'};margin-top:10px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--vscode-descriptionForeground);margin-bottom:6px;">From File</div>
            <div class="col-checks" id="extraColChecks">
              ${data.extraColumnKeys.map((k) => `
              <label class="filter-check-item">
                <input type="checkbox" name="tableColumn" value="extras.${k}"${
                  data.tableColumns.length === 0 || data.tableColumns.includes('extras.' + k) ? ' checked' : ''
                } />
                ${k}
              </label>`).join('')}
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Filters</label>
          <div class="field-desc">Toggle which filters are visible by default and set their pre-selected values.</div>
          <div class="filter-table">
            <div class="filter-table-head">
              <span>Filter</span>
              <span style="text-align:center">Visible</span>
              <span>Default Values</span>
            </div>
            ${filterTableRows}
          </div>
        </div>

      </div>
    </div>

  </div>

  <!-- ── Credentials tab ──────────────────────────────── -->
  <div class="main-tab-panel" id="main-tab-panel-credentials">

    <div class="card">
      <div class="card-header">
        <span class="card-header-icon">&#128273;</span>
        <span class="card-header-text">Credentials</span>
      </div>
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="linux">Linux / SSH</button>
        <button class="tab-btn" data-tab="windows">Windows / RDP</button>
      </div>
      <div class="card-body">

        <div class="tab-pane active" id="tab-linux">
          <div class="field">
            <label class="field-label" for="username">Username</label>
            <div class="field-desc">Leave blank to fall back to <code>sshFleetManager.defaultUser</code>.</div>
            <input type="text" id="username" value="${esc(data.username)}" placeholder="e.g. ec2-user, ubuntu" />
          </div>
          <div class="field">
            <label class="field-label" for="sshKeyPath">Private Key Path</label>
            <div class="field-desc">Leave blank to fall back to <code>sshFleetManager.sshKeyPath</code>.</div>
            <div class="input-row">
              <input type="text" id="sshKeyPath" value="${esc(data.sshKeyPath)}" placeholder="e.g. ~/.ssh/id_rsa" />
              <button class="btn-ghost btn-sm" id="browseKey">Browse&hellip;</button>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="password">Password</label>
            <div class="field-desc">Stored securely in your OS keychain. ${
              data.hasPassword ? 'A password is currently set.' : 'No password is set.'
            } Copied to clipboard when opening an SSH terminal.</div>
            <input type="password" id="password" placeholder="${
              data.hasPassword ? 'Leave blank to keep the current password' : 'Leave blank for key-based auth'
            }" />
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="clearPassword" ${data.hasPassword ? '' : 'disabled'} />
            <label for="clearPassword">Clear stored password</label>
          </div>
        </div>

        <div class="tab-pane" id="tab-windows">
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="rdpUsername">Username</label>
              <div class="field-desc">Windows user for Remote Desktop.</div>
              <input type="text" id="rdpUsername" value="${esc(data.rdpUsername)}" placeholder="e.g. Administrator" />
            </div>
            <div class="field">
              <label class="field-label" for="rdpDomain">Domain</label>
              <div class="field-desc">Leave blank for local accounts.</div>
              <input type="text" id="rdpDomain" value="${esc(data.rdpDomain)}" placeholder="e.g. CORP" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">Password</label>
            <div class="field-desc">Same stored password as SSH — used for RDP connections. Go to the <strong>Linux / SSH</strong> tab to set or clear it.</div>
            <input type="password" disabled placeholder="${
              data.hasPassword ? 'Password is set (manage in Linux tab)' : 'No password set (manage in Linux tab)'
            }" style="opacity:0.5;cursor:not-allowed;" />
          </div>
        </div>

      </div>
    </div>

  </div>

  <!-- ── Data Rules tab ───────────────────────────────── -->
  <div class="main-tab-panel" id="main-tab-panel-data-rules">

    <div class="card">
      <div class="card-header">
        <span class="card-header-icon">&#128683;</span>
        <span class="card-header-text">Exclude Filters</span>
      </div>
      <div class="card-body">
        <div class="field-desc">Hide servers from the Servers pane that match any of these field / value pairs.</div>
        <div class="rules-wrap" id="excludeRulesList"></div>
        <div class="add-rule">
          <select id="excludeField">${excludeFieldOptions}</select>
          <input type="text" id="excludeValue" list="excludeValueOptions" placeholder="Value to exclude" />
          <datalist id="excludeValueOptions"></datalist>
          <button class="btn-ghost btn-sm" id="addExcludeRule">+ Add</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-header-icon">&#128204;</span>
        <span class="card-header-text">Field Mapping</span>
      </div>
      <div class="card-body">
        <div class="field-desc">Override which Excel column maps to each field. Leave blank to use the default column name shown below the input.</div>
        <div class="mapping-table">
          ${fieldMappingRows}
        </div>
      </div>
    </div>

  </div>

</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const nameEl          = document.getElementById('name');
  const jsonFilePathEl  = document.getElementById('jsonFilePath');
  const xlsxSheetEl     = document.getElementById('xlsxSheet');
  const sheetRowEl      = document.getElementById('sheetRow');
  const groupByEl       = document.getElementById('groupBy');
  const usernameEl      = document.getElementById('username');
  const sshKeyPathEl    = document.getElementById('sshKeyPath');
  const rdpUsernameEl   = document.getElementById('rdpUsername');
  const rdpDomainEl     = document.getElementById('rdpDomain');
  const passwordEl      = document.getElementById('password');
  const clearPasswordEl = document.getElementById('clearPassword');
  const nameError       = document.getElementById('nameError');
  const savedBadge      = document.getElementById('savedBadge');
  const heroName        = document.getElementById('heroName');

  const fieldLabels = ${JSON.stringify(
    Object.fromEntries(GROUPABLE_FIELDS.map((f) => [f.value, f.label]))
  ).replace(/</g, '\\u003c')};
  let distinctValuesByField = ${JSON.stringify(data.distinctValuesByField).replace(/</g, '\\u003c')};
  let excludeRules = ${JSON.stringify(data.excludeRules).replace(/</g, '\\u003c')};
  const initialFilterValues = ${JSON.stringify(data.defaultFilterValues).replace(/</g, '\\u003c')};
  const savedTableColumns = ${JSON.stringify(data.tableColumns).replace(/</g, '\\u003c')};

  const extraColsSection = document.getElementById('extraColsSection');
  const extraColChecks   = document.getElementById('extraColChecks');

  function updateExtraColChecks(keys) {
    extraColsSection.style.display = keys.length > 0 ? 'block' : 'none';
    // Keep existing checked state for columns that survive; add new ones checked by default
    const currently = new Set(
      [...document.querySelectorAll('input[name="tableColumn"]')]
        .filter(el => el.value.startsWith('extras.') && el.checked)
        .map(el => el.value)
    );
    extraColChecks.innerHTML = '';
    keys.forEach(k => {
      const key = 'extras.' + k;
      const isChecked = savedTableColumns.length === 0 || currently.has(key) || savedTableColumns.includes(key);
      const label = document.createElement('label');
      label.className = 'filter-check-item';
      label.innerHTML =
        '<input type="checkbox" name="tableColumn" value="' + key + '"' + (isChecked ? ' checked' : '') + ' /> ' + k;
      extraColChecks.appendChild(label);
    });
  }

  // ── Main tab navigation ────────────────────────────────────────────────────
  document.querySelectorAll('.main-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.main-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('main-tab-panel-' + btn.dataset.mainTab)?.classList.add('active');
    });
  });

  // ── Credential sub-tabs ────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
    });
  });

  // ── Exclude rules ──────────────────────────────────────────────────────────
  const excludeRulesListEl    = document.getElementById('excludeRulesList');
  const excludeFieldEl        = document.getElementById('excludeField');
  const excludeValueEl        = document.getElementById('excludeValue');
  const excludeValueOptionsEl = document.getElementById('excludeValueOptions');

  function renderExcludeRules() {
    excludeRulesListEl.innerHTML = '';
    if (excludeRules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rules-empty';
      empty.textContent = 'No filters added yet.';
      excludeRulesListEl.appendChild(empty);
      return;
    }
    excludeRules.forEach((rule, idx) => {
      const chip = document.createElement('div');
      chip.className = 'rule-chip';
      chip.innerHTML =
        '<span class="field-tag">' + (fieldLabels[rule.field] || rule.field) + '</span>' +
        '<span>' + rule.value + '</span>';
      const rm = document.createElement('button');
      rm.className = 'btn-icon';
      rm.title = 'Remove';
      rm.textContent = '\\u00D7';
      rm.addEventListener('click', () => { excludeRules.splice(idx, 1); renderExcludeRules(); });
      chip.appendChild(rm);
      excludeRulesListEl.appendChild(chip);
    });
  }

  function updateExcludeValueOptions() {
    const values = distinctValuesByField[excludeFieldEl.value] || [];
    excludeValueOptionsEl.innerHTML = '';
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      excludeValueOptionsEl.appendChild(opt);
    }
  }

  excludeFieldEl.addEventListener('change', updateExcludeValueOptions);
  updateExcludeValueOptions();
  renderExcludeRules();

  document.getElementById('addExcludeRule').addEventListener('click', () => {
    const value = excludeValueEl.value.trim();
    if (!value) return;
    excludeRules.push({ field: excludeFieldEl.value, value });
    excludeValueEl.value = '';
    renderExcludeRules();
  });

  // ── Column select-all / clear ──────────────────────────────────────────────
  document.getElementById('btnCheckAllCols').addEventListener('click', () => {
    document.querySelectorAll('input[name="tableColumn"]').forEach(el => { el.checked = true; });
  });
  document.getElementById('btnUncheckAllCols').addEventListener('click', () => {
    document.querySelectorAll('input[name="tableColumn"]').forEach(el => { el.checked = false; });
  });

  // ── Checklist dropdown factory ─────────────────────────────────────────────
  function makeChecklist(container, initialOpts, initialSelected) {
    const sel = new Set(initialSelected || []);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cl-btn';

    const panel = document.createElement('div');
    panel.className = 'cl-panel';
    document.body.appendChild(panel);

    function updateBtn() {
      const count = sel.size;
      btn.innerHTML =
        (count === 0
          ? '<span style="opacity:0.5">(no default)</span>'
          : '<span>' + count + ' selected</span>') +
        '<span class="cl-btn-caret">&#9660;</span>';
      btn.classList.toggle('has-values', count > 0);
    }

    function syncCbs() {
      panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = sel.has(cb.value);
      });
    }

    function buildOptions(opts) {
      panel.innerHTML = '';
      if (opts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cl-empty';
        empty.textContent = 'No values loaded — save a data source first.';
        panel.appendChild(empty);
        return;
      }
      const acts = document.createElement('div');
      acts.className = 'cl-actions';
      const clrBtn = document.createElement('button');
      clrBtn.type = 'button';
      clrBtn.className = 'cl-clear';
      clrBtn.textContent = 'Clear selection';
      clrBtn.addEventListener('click', e => {
        e.stopPropagation();
        sel.clear(); syncCbs(); updateBtn();
      });
      acts.appendChild(clrBtn);
      panel.appendChild(acts);
      opts.forEach(v => {
        const label = document.createElement('label');
        label.className = 'cl-option';
        label.addEventListener('mousedown', e => e.preventDefault());
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = v;
        cb.checked = sel.has(v);
        cb.addEventListener('change', () => {
          if (cb.checked) sel.add(v); else sel.delete(v);
          updateBtn();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + v));
        panel.appendChild(label);
      });
    }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      closeAllChecklists();
      if (!isOpen) {
        panel.classList.add('open');
        btn.classList.add('open');
        const r = btn.getBoundingClientRect();
        panel.style.top = (r.bottom + 4) + 'px';
        panel.style.left = r.left + 'px';
        panel.style.minWidth = Math.max(r.width, 200) + 'px';
      }
    });
    panel.addEventListener('click', e => e.stopPropagation());

    buildOptions(initialOpts);
    updateBtn();
    container.appendChild(btn);

    return {
      getSelected() { return [...sel]; },
      setOptions(opts) {
        sel.forEach(v => { if (!opts.includes(v)) sel.delete(v); });
        buildOptions(opts); updateBtn();
      }
    };
  }

  function closeAllChecklists() {
    document.querySelectorAll('.cl-panel.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.cl-btn.open').forEach(b => b.classList.remove('open'));
  }
  document.addEventListener('click', closeAllChecklists);

  // ── Initialize checklists ──────────────────────────────────────────────────
  const fkeyToDistinctKey = {
    status: 'status', company: 'company', application: 'application',
    sbu: 'sbu', role: 'generalRole', serverClass: 'serverClass',
    account: 'accountName', owner: 'owner'
  };
  const checklists = {};

  (function() {
    const c = document.getElementById('cl-os');
    if (c) checklists['os'] = makeChecklist(c, ['linux', 'windows'], initialFilterValues['os'] || []);
  })();

  Object.entries(fkeyToDistinctKey).forEach(function([fkey, dk]) {
    const c = document.getElementById('cl-' + fkey);
    if (!c) return;
    checklists[fkey] = makeChecklist(c, distinctValuesByField[dk] || [], initialFilterValues[fkey] || []);
  });

  function updateFilterChecklists() {
    Object.entries(fkeyToDistinctKey).forEach(function([fkey, dk]) {
      if (checklists[fkey]) checklists[fkey].setOptions(distinctValuesByField[dk] || []);
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  document.getElementById('browseJson').addEventListener('click', () => vscode.postMessage({ type: 'browseJson' }));
  document.getElementById('browseKey').addEventListener('click',  () => vscode.postMessage({ type: 'browseKey' }));
  xlsxSheetEl.addEventListener('change', () => {
    vscode.postMessage({ type: 'loadDistinctValues', filePath: jsonFilePathEl.value, sheet: xlsxSheetEl.value });
  });
  document.getElementById('btnDeleteProject').addEventListener('click', () => vscode.postMessage({ type: 'deleteProject' }));
  document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));

  document.getElementById('save').addEventListener('click', () => {
    savedBadge.style.display = 'none';
    nameError.style.display  = 'none';
    if (!nameEl.value.trim()) {
      nameError.textContent   = 'Project name cannot be empty';
      nameError.style.display = 'inline';
      nameEl.focus();
      return;
    }
    const allColEls     = [...document.querySelectorAll('input[name="tableColumn"]')];
    const checkedColEls = allColEls.filter(el => el.checked);
    const tableColumns  = checkedColEls.length === allColEls.length ? [] : checkedColEls.map(el => el.value);
    const defaultFilterValues = {};
    Object.entries(checklists).forEach(([fkey, cl]) => {
      const vals = cl.getSelected();
      if (vals.length > 0) defaultFilterValues[fkey] = vals;
    });
    vscode.postMessage({
      type:                'save',
      name:                nameEl.value,
      jsonFilePath:        jsonFilePathEl.value,
      xlsxSheet:           xlsxSheetEl.value,
      groupBy:             groupByEl.value,
      defaultFilterFields: [...document.querySelectorAll('input[name="defaultFilterFields"]:checked')].map(el => el.value),
      defaultFilterValues,
      tableColumns,
      fieldMapping: Object.fromEntries(
        [...document.querySelectorAll('input[data-mapping-key]')]
          .map(el => [el.dataset.mappingKey, el.value.trim()])
          .filter(([, v]) => v)
      ),
      excludeRules,
      username:      usernameEl.value,
      sshKeyPath:    sshKeyPathEl.value,
      rdpUsername:   rdpUsernameEl.value,
      rdpDomain:     rdpDomainEl.value,
      password:      passwordEl.value,
      clearPassword: clearPasswordEl.checked,
    });
  });

  clearPasswordEl.addEventListener('change', () => {
    passwordEl.disabled = clearPasswordEl.checked;
    if (clearPasswordEl.checked) passwordEl.value = '';
  });

  // ── Messages from extension ────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'setJsonFilePath') {
      jsonFilePathEl.value = msg.value;
      const sheets = msg.sheets || [];
      xlsxSheetEl.innerHTML = '';
      sheets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = s;
        xlsxSheetEl.appendChild(opt);
      });
      sheetRowEl.style.display = sheets.length > 0 ? 'flex' : 'none';
      vscode.postMessage({
        type: 'loadDistinctValues',
        filePath: msg.value,
        sheet: sheets[0] || '',
      });
    }
    if (msg.type === 'setKeyPath') sshKeyPathEl.value = msg.value;
    if (msg.type === 'setDistinctValues') {
      distinctValuesByField = msg.value;
      updateExcludeValueOptions();
      updateFilterChecklists();
      updateExtraColChecks(msg.extraColumnKeys || []);
    }
    if (msg.type === 'error') {
      nameError.textContent   = msg.message;
      nameError.style.display = 'inline';
    }
    if (msg.type === 'saved') {
      heroName.textContent     = nameEl.value;
      savedBadge.style.display = 'inline-flex';
      setTimeout(() => (savedBadge.style.display = 'none'), 2500);
    }
  });
</script>
</body>
</html>`;
}
