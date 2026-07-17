import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Server } from './types';

let panel: vscode.WebviewPanel | undefined;

export function openJsonVisualizerPanel(servers: Server[], defaultFilterFields?: string[]): void {
  if (panel) {
    panel.reveal();
    panel.webview.postMessage({ type: 'setServers', servers });
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'sshFleetManagerJsonVisualizer',
    'Asset Table',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.iconPath = new vscode.ThemeIcon('table');

  panel.onDidDispose(() => {
    panel = undefined;
  });

  const nonce = crypto.randomBytes(16).toString('hex');
  panel.webview.html = getHtml(nonce, defaultFilterFields);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'copy') {
      await vscode.env.clipboard.writeText(msg.value);
      vscode.window.showInformationMessage('Copied to clipboard');
    }
  });

  // Send data after HTML is set — a short delay ensures the webview is ready
  setTimeout(() => {
    panel?.webview.postMessage({ type: 'setServers', servers });
  }, 200);
}

export function updateJsonVisualizerPanel(servers: Server[]): void {
  if (panel) {
    panel.webview.postMessage({ type: 'setServers', servers });
  }
}

function getHtml(nonce: string, defaultFilterFields?: string[]): string {
  const linuxSvg   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 9l4 4-4 4"/><path d="M14 17h4"/></svg>`;
  const windowsSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5L10.5 4.5V11.5H3V5.5Z"/><path d="M11.5 4.35L21 3V11.5H11.5V4.35Z"/><path d="M3 12.5H10.5V19.5L3 18.5V12.5Z"/><path d="M11.5 12.5H21V21L11.5 19.65V12.5Z"/></svg>`;
  const gearSvg    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  const chevronSvg = `<svg class="hn-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  const listSvg    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

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
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }

  .hero {
    padding: 14px 20px 12px;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.06));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    flex: 0 0 auto;
  }
  .hero h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.2; margin-bottom: 2px; }
  .hero-sub { font-size: 12px; color: var(--vscode-descriptionForeground); }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    flex-wrap: wrap;
    flex: 0 0 auto;
    background: var(--vscode-editor-background);
    position: relative;
  }
  .toolbar-sep { width: 1px; height: 20px; background: var(--vscode-panel-border, rgba(128,128,128,0.3)); flex: 0 0 auto; }
  .count-badge { margin-left: auto; font-size: 12px; color: var(--vscode-descriptionForeground); white-space: nowrap; font-variant-numeric: tabular-nums; }

  input[type="text"] {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 3px;
    padding: 4px 8px;
    outline: none;
    width: 190px;
  }
  input[type="text"]:focus { border-color: var(--vscode-focusBorder, #007acc); }

  select {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 3px;
    padding: 4px 6px;
    outline: none;
    cursor: pointer;
  }

  button {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    border: none;
    border-radius: 3px;
    padding: 5px 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: background 0.12s;
    line-height: 1;
    white-space: nowrap;
  }
  .btn-ghost { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3)); }
  .btn-ghost:hover { background: var(--vscode-list-hoverBackground); }
  .btn-icon { background: transparent; color: var(--vscode-icon-foreground, var(--vscode-foreground)); border: 1px solid transparent; padding: 4px 6px; border-radius: 3px; }
  .btn-icon:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-panel-border, rgba(128,128,128,0.3)); }
  .btn-icon.active { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder, #007acc); }

  /* ── Settings dropdown ───────────────────────────────── */
  .settings-panel {
    position: fixed;
    z-index: 200;
    background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
    border-radius: 6px;
    padding: 10px 0;
    min-width: 220px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    display: none;
  }
  .settings-panel.open { display: block; }
  .settings-section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--vscode-descriptionForeground);
    padding: 6px 14px 4px;
    margin-top: 4px;
  }
  .settings-section-title:first-child { margin-top: 0; }
  .settings-divider { height: 1px; background: var(--vscode-panel-border, rgba(128,128,128,0.2)); margin: 6px 0; }
  .settings-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 14px;
    cursor: pointer;
    font-size: 12px;
    user-select: none;
    transition: background 0.1s;
  }
  .settings-item:hover { background: var(--vscode-list-hoverBackground); }
  .settings-item input[type="checkbox"] { cursor: pointer; width: 13px; height: 13px; flex: 0 0 auto; }

  /* ── Hostname bulk filter ─────────────────────────────── */
  .hostname-section {
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    flex: 0 0 auto;
    background: var(--vscode-editor-background);
  }
  .hostname-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    user-select: none;
    transition: background 0.1s;
  }
  .hostname-header:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
  .hn-chevron {
    flex: 0 0 auto;
    transition: transform 0.15s ease;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    opacity: 0.6;
  }
  .hostname-section.open .hn-chevron { transform: rotate(90deg); }
  .hostname-label { font-weight: 500; }
  .hostname-active-badge {
    font-size: 10px;
    font-weight: 600;
    background: var(--vscode-badge-background, rgba(0,120,212,0.2));
    color: var(--vscode-badge-foreground, var(--vscode-foreground));
    border-radius: 10px;
    padding: 1px 8px;
    display: none;
    border: 1px solid var(--vscode-badge-background, rgba(0,120,212,0.3));
  }
  .hostname-body { padding: 0 14px 10px; display: none; }
  .hostname-section.open .hostname-body { display: block; }
  textarea {
    width: 100%;
    height: 90px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 3px;
    padding: 6px 8px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    outline: none;
    resize: vertical;
    margin-bottom: 6px;
  }
  textarea:focus { border-color: var(--vscode-focusBorder); }
  textarea::placeholder { color: var(--vscode-input-placeholderForeground); font-family: var(--vscode-font-family); }
  .hostname-footer { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--vscode-descriptionForeground); }

  /* ── Table ───────────────────────────────────────────── */
  .table-wrap { flex: 1 1 auto; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { position: sticky; top: 0; z-index: 10; background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background)); }
  th {
    text-align: left; padding: 7px 12px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    white-space: nowrap; cursor: pointer; user-select: none;
  }
  th:hover { color: var(--vscode-foreground); }
  th .sort-icon { display: inline-block; margin-left: 4px; opacity: 0.5; font-style: normal; }
  th.sort-active .sort-icon { opacity: 1; color: var(--vscode-foreground); }
  td {
    padding: 5px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.08));
    white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis;
    cursor: pointer; vertical-align: middle;
  }
  tbody tr:hover td { background: var(--vscode-list-hoverBackground); }
  @keyframes cellFlash { 0% { background: rgba(0,120,212,0.25); } 100% { background: transparent; } }
  td.flash { animation: cellFlash 0.4s ease-out forwards; }

  .os-cell, .status-cell { display: inline-flex; align-items: center; gap: 5px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
  .dot-green { background: #4caf50; }
  .dot-grey  { background: #888; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 60px 20px; color: var(--vscode-descriptionForeground); font-size: 13px; text-align: center; }
  .empty-icon { font-size: 32px; opacity: 0.4; }

  /* ── Export section ─────────────────────────────────── */
  .export-section {
    flex: 0 0 auto;
    background: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  /* Drag-to-resize handle */
  .resize-handle {
    flex: 0 0 5px;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-editorGroup-border, rgba(128,128,128,0.05));
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    transition: background 0.1s;
  }
  .resize-handle:hover { background: var(--vscode-list-hoverBackground); }
  .resize-handle::after {
    content: '';
    width: 22px;
    height: 2px;
    background: var(--vscode-panel-border, rgba(128,128,128,0.4));
    transition: background 0.1s;
  }
  .resize-handle:hover::after { background: var(--vscode-focusBorder, #007acc); }

  /* Header bar */
  .export-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 10px;
    height: 28px;
    cursor: pointer;
    user-select: none;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.04));
    flex: 0 0 auto;
    transition: background 0.1s;
  }
  .export-header:hover { background: var(--vscode-list-hoverBackground); }
  .export-chevron { flex: 0 0 auto; transition: transform 0.15s ease; opacity: 0.5; }
  .export-section.open .export-chevron { transform: rotate(180deg); }
  .export-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--vscode-foreground);
    flex: 0 0 auto;
  }
  .export-tagline { font-size: 11px; color: var(--vscode-descriptionForeground); flex: 1; }

  /* Collapsible body */
  .export-body {
    display: none;
    flex: 1;
    overflow: hidden;
    flex-direction: column;
    min-height: 0;
  }
  .export-section.open .export-body { display: flex; }

  /* Toolbar row: format tabs flush-left, generate button right-aligned */
  .export-toolbar {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    flex: 0 0 auto;
  }
  .format-tabs { display: flex; flex: 1; }
  .format-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 14px;
    height: 33px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    font-weight: 400;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    user-select: none;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
    white-space: nowrap;
  }
  .format-tab:hover { color: var(--vscode-foreground); background: var(--vscode-list-hoverBackground); }
  .format-tab.selected {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder, #007acc);
    font-weight: 500;
  }
  .format-tab svg { opacity: 0.6; }
  .format-tab.selected svg { opacity: 1; }
  .btn-generate {
    align-self: center;
    font-family: var(--vscode-font-family);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 0 13px;
    height: 22px;
    margin: 0 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    transition: background 0.1s;
  }
  .btn-generate:hover { background: var(--vscode-button-hoverBackground); }

  /* Output block */
  .output-area {
    display: none;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    padding: 8px 10px 10px;
    min-height: 0;
  }
  .output-area.visible { display: flex; }
  .output-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.06));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-left: 2px solid var(--vscode-focusBorder, #007acc);
    border-bottom: none;
    flex: 0 0 auto;
  }
  .output-format-name { font-size: 11px; font-weight: 600; flex: 1; color: var(--vscode-foreground); }
  .output-count {
    font-size: 10px;
    font-weight: 600;
    background: rgba(0,120,212,0.1);
    color: var(--vscode-focusBorder, #007acc);
    padding: 1px 7px;
    letter-spacing: 0.3px;
  }
  .export-textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 100px;
    height: 200px;
    background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15));
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-left: 2px solid var(--vscode-focusBorder, #007acc);
    padding: 10px 12px;
    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
    font-size: 12px;
    outline: none;
    resize: vertical;
    line-height: 1.65;
    flex: 0 0 auto;
  }
</style>
</head>
<body>

<div class="hero">
  <h1>Asset Table</h1>
  <div class="hero-sub" id="heroSub">No servers loaded</div>
</div>

<div class="toolbar">
  <input type="text" id="searchInput" placeholder="Search all fields…" />

  <span id="osWrap" style="display:none"><select id="osFilter"><option value="">OS (All)</option><option value="linux">Linux</option><option value="windows">Windows</option></select></span>
  <span id="statusWrap" style="display:none"><select id="statusFilter"><option value="">Status (All)</option></select></span>
  <span id="companyWrap" style="display:none"><select id="companyFilter"><option value="">Company (All)</option></select></span>
  <span id="appWrap" style="display:none"><select id="appFilter"><option value="">Application (All)</option></select></span>
  <span id="sbuWrap" style="display:none"><select id="sbuFilter"><option value="">SBU (All)</option></select></span>
  <span id="roleWrap" style="display:none"><select id="roleFilter"><option value="">Role (All)</option></select></span>
  <span id="scWrap" style="display:none"><select id="scFilter"><option value="">Server Class (All)</option></select></span>
  <span id="acctWrap" style="display:none"><select id="acctFilter"><option value="">Account (All)</option></select></span>
  <span id="ownerWrap" style="display:none"><select id="ownerFilter"><option value="">Owner (All)</option></select></span>

  <div class="toolbar-sep"></div>
  <button class="btn-ghost" id="btnCsvCopy">Copy CSV</button>
  <button class="btn-ghost" id="btnJsonCopy">Copy JSON</button>
  <button class="btn-ghost" id="btnClear">Clear</button>
  <button class="btn-icon" id="btnGear" title="Filter settings">${gearSvg}</button>
  <span class="count-badge" id="countBadge">0 / 0</span>
</div>

<!-- Settings dropdown -->
<div class="settings-panel" id="settingsPanel">
  <div class="settings-section-title">Default Filters</div>
  <label class="settings-item"><input type="checkbox" id="visOs"> OS</label>
  <label class="settings-item"><input type="checkbox" id="visStatus"> Status</label>
  <label class="settings-item"><input type="checkbox" id="visCompany"> Company</label>
  <label class="settings-item"><input type="checkbox" id="visApp"> Application</label>
  <div class="settings-divider"></div>
  <div class="settings-section-title">Additional Filters</div>
  <label class="settings-item"><input type="checkbox" id="visSbu"> SBU</label>
  <label class="settings-item"><input type="checkbox" id="visRole"> General Role</label>
  <label class="settings-item"><input type="checkbox" id="visSc"> Server Class</label>
  <label class="settings-item"><input type="checkbox" id="visAcct"> Account</label>
  <label class="settings-item"><input type="checkbox" id="visOwner"> Owner</label>
  <div class="settings-divider"></div>
  <div class="settings-section-title">Bulk Filter</div>
  <label class="settings-item"><input type="checkbox" id="visHostname"> Hostname (bulk)</label>
</div>

<!-- Hostname bulk filter -->
<div class="hostname-section" id="hostnameSection">
  <div class="hostname-header" id="hostnameToggle">
    ${chevronSvg}
    ${listSvg}
    <span class="hostname-label">Hostname Filter</span>
    <span class="hostname-active-badge" id="hostnameBadge"></span>
  </div>
  <div class="hostname-body">
    <textarea id="hostnameInput" placeholder="Paste hostnames here, one per line…&#10;Exact match, case-insensitive"></textarea>
    <div class="hostname-footer">
      <span>Exact match, case-insensitive</span>
      <button class="btn-ghost" id="hostnameClear" style="font-size:11px;padding:3px 8px;">Clear</button>
    </div>
  </div>
</div>

<div class="table-wrap">
  <div class="empty-state" id="emptyState">
    <div class="empty-icon">⊞</div>
    <div>No servers loaded — open a project and load a JSON or Excel file.</div>
  </div>
  <table id="dataTable" style="display:none">
    <thead><tr id="headerRow"></tr></thead>
    <tbody id="tableBody"></tbody>
  </table>
</div>

<!-- Export section -->
<div class="export-section" id="exportSection">
  <div class="resize-handle" id="exportResizeHandle"></div>
  <div class="export-header" id="exportToggle">
    <svg class="export-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
    <span class="export-title">Export</span>
    <span class="export-tagline">Transform filtered servers into config files</span>
  </div>
  <div class="export-body">
    <div class="export-toolbar">
      <div class="format-tabs">
        <button class="format-tab selected" data-tab="ami">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="2"/><rect x="2" y="10" width="20" height="5" rx="2"/><rect x="2" y="17" width="20" height="5" rx="2"/></svg>
          AWS AMI Backup
        </button>
        <button class="format-tab" data-tab="ansible">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          Ansible Vars
        </button>
      </div>
      <button class="btn-generate" id="btnGenerate">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Generate
      </button>
    </div>

    <div class="output-area" id="outputArea">
      <div class="output-header">
        <span class="output-format-name" id="outputFormatName"></span>
        <span class="output-count" id="outputCount"></span>
        <button class="btn-ghost" id="btnCopyExport" style="font-size:11px;padding:2px 10px;margin-left:4px;">Copy</button>
      </div>
      <textarea class="export-textarea" id="exportOutput" readonly spellcheck="false"></textarea>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const DEFAULT_FILTER_FIELDS = ${JSON.stringify(defaultFilterFields ?? [])};
  let initialFilterApplied = false;

  const COLUMNS = [
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
    { key: 'owner',        label: 'Owner' },
    { key: 'instanceType', label: 'Instance Type' },
    { key: 'osVersion',    label: 'OS Version' },
    { key: 'instanceId',   label: 'Instance ID' },
  ];

  let allServers  = [];
  let search      = '';
  let filters     = { os:'', status:'', company:'', application:'', sbu:'', role:'', serverClass:'', account:'', owner:'' };
  let hostnameSet = new Set();
  let sortField   = '';
  let sortDir     = 1;

  const searchInput    = document.getElementById('searchInput');
  const osFilter       = document.getElementById('osFilter');
  const statusFilter   = document.getElementById('statusFilter');
  const companyFilter  = document.getElementById('companyFilter');
  const appFilter      = document.getElementById('appFilter');
  const sbuFilter      = document.getElementById('sbuFilter');
  const roleFilter     = document.getElementById('roleFilter');
  const scFilter       = document.getElementById('scFilter');
  const acctFilter     = document.getElementById('acctFilter');
  const ownerFilter    = document.getElementById('ownerFilter');
  const countBadge     = document.getElementById('countBadge');
  const heroSub        = document.getElementById('heroSub');
  const emptyState     = document.getElementById('emptyState');
  const dataTable      = document.getElementById('dataTable');
  const headerRow      = document.getElementById('headerRow');
  const tableBody      = document.getElementById('tableBody');
  const hostnameInput  = document.getElementById('hostnameInput');
  const hostnameBadge  = document.getElementById('hostnameBadge');
  const hostnameSection = document.getElementById('hostnameSection');
  const settingsPanel  = document.getElementById('settingsPanel');
  const btnGear        = document.getElementById('btnGear');

  // ── Gear dropdown ──────────────────────────────────────────────────────────
  btnGear.addEventListener('click', e => {
    e.stopPropagation();
    const r = btnGear.getBoundingClientRect();
    settingsPanel.style.top   = (r.bottom + 6) + 'px';
    settingsPanel.style.right = (window.innerWidth - r.right) + 'px';
    const open = settingsPanel.classList.toggle('open');
    btnGear.classList.toggle('active', open);
  });
  document.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
    btnGear.classList.remove('active');
  });
  settingsPanel.addEventListener('click', e => e.stopPropagation());

  const VIS_MAP = [
    { id: 'visOs',       wrap: 'osWrap',     fkey: 'os',          sel: osFilter },
    { id: 'visStatus',   wrap: 'statusWrap', fkey: 'status',      sel: statusFilter },
    { id: 'visCompany',  wrap: 'companyWrap',fkey: 'company',     sel: companyFilter },
    { id: 'visApp',      wrap: 'appWrap',    fkey: 'application', sel: appFilter },
    { id: 'visSbu',      wrap: 'sbuWrap',    fkey: 'sbu',         sel: sbuFilter },
    { id: 'visRole',     wrap: 'roleWrap',   fkey: 'role',        sel: roleFilter },
    { id: 'visSc',       wrap: 'scWrap',     fkey: 'serverClass', sel: scFilter },
    { id: 'visAcct',     wrap: 'acctWrap',   fkey: 'account',     sel: acctFilter },
    { id: 'visOwner',    wrap: 'ownerWrap',  fkey: 'owner',       sel: ownerFilter },
  ];

  function applyVisibility() {
    VIS_MAP.forEach(({ id, wrap, fkey, sel }) => {
      const on = document.getElementById(id).checked;
      document.getElementById(wrap).style.display = on ? '' : 'none';
      if (!on) { filters[fkey] = ''; sel.value = ''; }
    });
    const hnOn = document.getElementById('visHostname').checked;
    hostnameSection.style.display = hnOn ? '' : 'none';
    if (!hnOn) { hostnameSet = new Set(); hostnameInput.value = ''; hostnameBadge.style.display = 'none'; }
    renderBody();
  }

  [...VIS_MAP.map(v => v.id), 'visHostname'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyVisibility);
  });

  // ── Hostname section ───────────────────────────────────────────────────────
  document.getElementById('hostnameToggle').addEventListener('click', () => {
    hostnameSection.classList.toggle('open');
  });

  hostnameInput.addEventListener('input', () => {
    const lines = hostnameInput.value.split('\\n').map(l => l.trim().toLowerCase()).filter(Boolean);
    hostnameSet = new Set(lines);
    hostnameBadge.style.display = hostnameSet.size > 0 ? 'inline' : 'none';
    if (hostnameSet.size > 0) hostnameBadge.textContent = hostnameSet.size + ' host' + (hostnameSet.size > 1 ? 's' : '');
    renderBody();
  });

  document.getElementById('hostnameClear').addEventListener('click', () => {
    hostnameInput.value = ''; hostnameSet = new Set(); hostnameBadge.style.display = 'none';
    renderBody();
  });

  // ── Filter & sort ──────────────────────────────────────────────────────────
  function getFiltered() {
    const q = search.trim().toLowerCase();
    return allServers
      .filter(s => {
        if (filters.os          && s.os          !== filters.os)            return false;
        if (filters.status      && s.status      !== filters.status)        return false;
        if (filters.company     && s.company     !== filters.company)       return false;
        if (filters.application && s.application !== filters.application)   return false;
        if (filters.sbu         && s.sbu         !== filters.sbu)           return false;
        if (filters.role        && s.generalRole !== filters.role)          return false;
        if (filters.serverClass && s.serverClass !== filters.serverClass)   return false;
        if (filters.account     && s.accountName !== filters.account)       return false;
        if (filters.owner       && s.owner       !== filters.owner)         return false;
        if (hostnameSet.size > 0 && !hostnameSet.has((s.hostname || '').toLowerCase())) return false;
        if (q) {
          const hay = [s.hostname, s.privateIp, s.fqdn, s.application, s.owner, s.company, s.sbu, s.accountName, s.generalRole, s.serverClass]
            .join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!sortField) return 0;
        const av = String(a[sortField] ?? '').toLowerCase();
        const bv = String(b[sortField] ?? '').toLowerCase();
        return av < bv ? -sortDir : av > bv ? sortDir : 0;
      });
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  function buildHeader() {
    headerRow.innerHTML = '';
    COLUMNS.forEach(col => {
      const th = document.createElement('th');
      const sorted = sortField === col.key;
      if (sorted) th.classList.add('sort-active');
      th.innerHTML = esc(col.label) + '<i class="sort-icon">' + (sorted ? (sortDir === 1 ? '↑' : '↓') : '↕') + '</i>';
      th.addEventListener('click', () => {
        if (sortField === col.key) { sortDir === 1 ? (sortDir = -1) : (sortField = '', sortDir = 1); }
        else { sortField = col.key; sortDir = 1; }
        buildHeader(); renderBody();
      });
      headerRow.appendChild(th);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const linuxSvg   = \`${linuxSvg}\`;
  const windowsSvg = \`${windowsSvg}\`;

  function renderCell(col, s) {
    const raw = String(s[col.key] ?? '');
    if (col.key === 'os') {
      const w = s.os === 'windows';
      return '<span class="os-cell">' + (w ? windowsSvg : linuxSvg) + (w ? 'Windows' : 'Linux') + '</span>';
    }
    if (col.key === 'status') {
      const on = raw.toLowerCase().includes('running');
      return '<span class="status-cell"><span class="dot ' + (on ? 'dot-green' : 'dot-grey') + '"></span>' + esc(raw) + '</span>';
    }
    return esc(raw);
  }

  function renderBody() {
    const filtered = getFiltered();
    countBadge.textContent = filtered.length.toLocaleString() + ' / ' + allServers.length.toLocaleString();

    if (allServers.length === 0) {
      dataTable.style.display = 'none'; emptyState.style.display = 'flex';
      emptyState.innerHTML = '<div class="empty-icon">⊞</div><div>No servers loaded — open a project and load a JSON or Excel file.</div>';
      return;
    }
    if (filtered.length === 0) {
      dataTable.style.display = 'none'; emptyState.style.display = 'flex';
      emptyState.innerHTML = '<div class="empty-icon">⊘</div><div>No servers match the current filters.</div>';
      return;
    }

    emptyState.style.display = 'none';
    dataTable.style.display  = '';
    tableBody.innerHTML = filtered.map(s =>
      '<tr>' + COLUMNS.map(col => {
        const raw = col.key === 'os' ? s.os : String(s[col.key] ?? '');
        return '<td data-value="' + esc(raw) + '">' + renderCell(col, s) + '</td>';
      }).join('') + '</tr>'
    ).join('');

    tableBody.querySelectorAll('td').forEach(td => {
      td.addEventListener('click', () => {
        vscode.postMessage({ type: 'copy', value: td.dataset.value || '' });
        td.classList.remove('flash'); void td.offsetWidth; td.classList.add('flash');
        td.addEventListener('animationend', () => td.classList.remove('flash'), { once: true });
      });
    });

  }

  function render() { buildHeader(); renderBody(); invalidateExportCache(); }

  // ── Rebuild dropdown options ───────────────────────────────────────────────
  function rebuildFilterOptions() {
    const distinct = key => [...new Set(allServers.map(s => s[key]).filter(Boolean))].sort();
    function repopulate(sel, vals, lbl) {
      const prev = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      sel.options[0].textContent = lbl + ' (All)';
      vals.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; sel.appendChild(o); });
      sel.value = vals.includes(prev) ? prev : '';
    }
    repopulate(statusFilter,  distinct('status'),      'Status');
    repopulate(companyFilter, distinct('company'),     'Company');
    repopulate(appFilter,     distinct('application'), 'Application');
    repopulate(sbuFilter,     distinct('sbu'),         'SBU');
    repopulate(roleFilter,    distinct('generalRole'), 'Role');
    repopulate(scFilter,      distinct('serverClass'), 'Server Class');
    repopulate(acctFilter,    distinct('accountName'), 'Account');
    repopulate(ownerFilter,   distinct('owner'),       'Owner');
  }

  // ── CSV ────────────────────────────────────────────────────────────────────
  function toCSV(rows) {
    const e2 = v => { const s = String(v??''); return (s.includes(',')||s.includes('"')||s.includes('\\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };
    return [COLUMNS.map(c=>c.label).map(e2).join(','), ...rows.map(s=>COLUMNS.map(c=>e2(s[c.key]??'')).join(','))].join('\\n');
  }

  // ── Event wiring ──────────────────────────────────────────────────────────
  searchInput.addEventListener('input',    () => { search = searchInput.value; renderBody(); });
  osFilter.addEventListener('change',      () => { filters.os = osFilter.value; renderBody(); });
  statusFilter.addEventListener('change',  () => { filters.status = statusFilter.value; renderBody(); });
  companyFilter.addEventListener('change', () => { filters.company = companyFilter.value; renderBody(); });
  appFilter.addEventListener('change',     () => { filters.application = appFilter.value; renderBody(); });
  sbuFilter.addEventListener('change',     () => { filters.sbu = sbuFilter.value; renderBody(); });
  roleFilter.addEventListener('change',    () => { filters.role = roleFilter.value; renderBody(); });
  scFilter.addEventListener('change',      () => { filters.serverClass = scFilter.value; renderBody(); });
  acctFilter.addEventListener('change',    () => { filters.account = acctFilter.value; renderBody(); });
  ownerFilter.addEventListener('change',   () => { filters.owner = ownerFilter.value; renderBody(); });

  document.getElementById('btnCsvCopy').addEventListener('click', () => {
    vscode.postMessage({ type: 'copy', value: toCSV(getFiltered()) });
  });
  document.getElementById('btnJsonCopy').addEventListener('click', () => {
    vscode.postMessage({ type: 'copy', value: JSON.stringify(getFiltered(), null, 2) });
  });
  document.getElementById('btnClear').addEventListener('click', () => {
    search = '';
    filters = { os:'', status:'', company:'', application:'', sbu:'', role:'', serverClass:'', account:'', owner:'' };
    hostnameSet = new Set(); sortField = ''; sortDir = 1;
    [searchInput, osFilter, statusFilter, companyFilter, appFilter, sbuFilter, roleFilter, scFilter, acctFilter, ownerFilter]
      .forEach(el => el.value = '');
    hostnameInput.value = ''; hostnameBadge.style.display = 'none';
    render();
  });

  // ── Messages ───────────────────────────────────────────────────────────────
  // GroupBy field key → VIS_MAP fkey
  const FIELD_TO_FKEY = {
    status: 'status', company: 'company', sbu: 'sbu', generalRole: 'role',
    serverClass: 'serverClass', application: 'application', accountName: 'account', owner: 'owner'
  };

  window.addEventListener('message', e => {
    if (e.data.type === 'setServers') {
      allServers = e.data.servers || [];
      heroSub.textContent = allServers.length === 0 ? 'No servers loaded' : allServers.length.toLocaleString() + ' servers';
      rebuildFilterOptions();
      if (!initialFilterApplied && DEFAULT_FILTER_FIELDS.length > 0) {
        initialFilterApplied = true;
        DEFAULT_FILTER_FIELDS.forEach(field => {
          const fkey = FIELD_TO_FKEY[field];
          if (!fkey) return;
          const entry = VIS_MAP.find(v => v.fkey === fkey);
          if (!entry) return;
          const checkbox = document.getElementById(entry.id);
          if (checkbox && !checkbox.checked) { checkbox.checked = true; }
          document.getElementById(entry.wrap).style.display = '';
        });
      }
      render();
    }
  });

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Export ────────────────────────────────────────────────────────────────
  let activeExportTab = 'ami';
  let generatedOutputs = { ami: null, ansible: null }; // null = not yet generated

  const exportSection    = document.getElementById('exportSection');
  const exportOutput     = document.getElementById('exportOutput');
  const outputArea       = document.getElementById('outputArea');
  const outputFormatName = document.getElementById('outputFormatName');
  const outputCount      = document.getElementById('outputCount');
  const btnGenerate      = document.getElementById('btnGenerate');

  // Stored resize height; applied when section is open
  let resizeHeight = 0;

  // Collapse toggle
  document.getElementById('exportToggle').addEventListener('click', () => {
    const willOpen = !exportSection.classList.contains('open');
    exportSection.classList.toggle('open');
    exportSection.style.flex = (willOpen && resizeHeight) ? '0 0 ' + resizeHeight + 'px' : '';
  });

  // Resize drag handle
  const resizeHandle = document.getElementById('exportResizeHandle');
  let isResizing   = false;
  let resizeStartY = 0;
  let resizeStartH = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing   = true;
    resizeStartY = e.clientY;
    resizeStartH = exportSection.offsetHeight;
    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dy = resizeStartY - e.clientY;
    resizeHeight = Math.min(Math.max(resizeStartH + dy, 80), window.innerHeight * 0.85);
    exportSection.style.flex = '0 0 ' + resizeHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });

  function showOutput(tab) {
    const iAmi     = generatedOutputs.ami     !== null;
    const iAnsible = generatedOutputs.ansible !== null;
    if (!iAmi && !iAnsible) { outputArea.classList.remove('visible'); return; }

    if (tab === 'ami') {
      const valid = getFiltered().filter(s => s.instanceId && s.accountName);
      exportOutput.value       = generatedOutputs.ami;
      outputFormatName.textContent = 'AWS AMI Backup Config';
      outputCount.textContent  = valid.length + ' instance' + (valid.length !== 1 ? 's' : '');
    } else {
      const valid = getFiltered().filter(s => s.hostname && s.privateIp);
      exportOutput.value       = generatedOutputs.ansible;
      outputFormatName.textContent = 'Ansible Inventory';
      outputCount.textContent  = valid.length + ' host' + (valid.length !== 1 ? 's' : '');
    }
    outputArea.classList.add('visible');
  }

  document.querySelectorAll('.format-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.format-tab').forEach(t => t.classList.remove('selected'));
      tab.classList.add('selected');
      activeExportTab = tab.dataset.tab;
      showOutput(activeExportTab);
    });
  });

  btnGenerate.addEventListener('click', () => {
    const filtered = getFiltered();
    generatedOutputs.ami     = generateAmiBackup(filtered);
    generatedOutputs.ansible = generateAnsibleVars(filtered);
    btnGenerate.textContent  = 'Regenerate';
    showOutput(activeExportTab);
  });

  // When filters/data change, invalidate cached outputs so user knows to regenerate
  function invalidateExportCache() {
    generatedOutputs = { ami: null, ansible: null };
    outputArea.classList.remove('visible');
    btnGenerate.textContent = 'Generate';
  }

  document.getElementById('btnCopyExport').addEventListener('click', () => {
    vscode.postMessage({ type: 'copy', value: exportOutput.value });
  });

  function generateAmiBackup(servers) {
    const valid = servers.filter(s => s.instanceId && s.accountName);
    if (valid.length === 0) {
      return '# No servers with both Instance ID and Account in the current filter.\\n# Ensure your data source includes these fields.';
    }
    const groups = {};
    for (const s of valid) {
      if (!groups[s.accountName]) groups[s.accountName] = [];
      groups[s.accountName].push(s);
    }
    let out = '# default value\\ndefaults:\\n  vault_name: "Default"\\n  region: "ap-southeast-1"\\n  expire_days: 3\\n';
    for (const acct of Object.keys(groups).sort()) {
      out += '\\n' + acct + ':\\n';
      for (const s of groups[acct]) {
        out += '  # ' + s.hostname + '\\n';
        out += '  - instance_id: ' + s.instanceId + '\\n';
      }
    }
    return out;
  }

  function generateAnsibleVars(servers) {
    const valid = servers.filter(s => s.hostname && s.privateIp);
    if (valid.length === 0) {
      return '# No servers with hostname and IP in the current filter.';
    }
    let out = 'all:\\n  hosts:\\n';
    for (const s of valid) {
      out += '    ' + s.hostname.toLowerCase() + ': { ansible_host: ' + s.privateIp + ' }\\n';
    }
    return out;
  }

  render();
</script>
</body>
</html>`;
}
