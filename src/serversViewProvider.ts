import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Server, GroupBy } from './types';

export type ServersViewMessage =
  | { type: 'ready' }
  | { type: 'openSsh'; server: Server }
  | { type: 'copyCommand'; server: Server }
  | { type: 'openRdp'; server: Server }
  | { type: 'copyRdpCommand'; server: Server }
  | { type: 'openDetail'; server: Server }
  | { type: 'openAssetTable' };

export class ServersViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'sshFleetManagerView';

  private _view?: vscode.WebviewView;
  private servers: Server[] = [];
  private projectName: string | undefined;
  private groupByField: GroupBy = 'company';

  private _onMessage = new vscode.EventEmitter<ServersViewMessage>();
  readonly onMessage = this._onMessage.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    const codiconsUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, 'codicons', 'codicon.css')
    );
    webviewView.webview.html = this.getHtml(
      crypto.randomBytes(16).toString('hex'),
      codiconsUri,
      webviewView.webview.cspSource
    );

    webviewView.webview.onDidReceiveMessage((msg: ServersViewMessage) => {
      if (msg.type === 'ready') {
        this.postUpdate();
      } else {
        this._onMessage.fire(msg);
      }
    });
  }

  setServers(servers: Server[]) {
    this.servers = servers;
    this.postUpdate();
  }

  setProjectName(name: string | undefined) {
    this.projectName = name;
    this.postUpdate();
  }

  setGroupByField(field: GroupBy) {
    this.groupByField = field;
    this.postUpdate();
  }

  private postUpdate() {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'update',
      projectName: this.projectName,
      servers: this.servers,
      groupBy: this.groupByField,
    });
  }

  private getHtml(nonce: string, codiconsUri: vscode.Uri, cspSource: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${codiconsUri}">
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    display: flex;
    flex-direction: column;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
  }
  .toolbar { padding: 6px 8px; flex: 0 0 auto; }
  .project-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .project-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .btn-asset-table {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--vscode-font-family);
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .btn-asset-table:hover { background: var(--vscode-button-hoverBackground); }
  .hint { color: var(--vscode-descriptionForeground); margin-bottom: 6px; font-size: 12px; }
  .pane-subtitle {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
    opacity: 0.8;
  }
  .search-row {
    display: flex;
    align-items: center;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 0 6px;
    gap: 4px;
  }
  .search-row:focus-within { border-color: var(--vscode-focusBorder); }
  .search-row input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--vscode-input-foreground);
    font-family: inherit;
    font-size: inherit;
    padding: 5px 0;
    min-width: 0;
  }
  .search-row input::placeholder { color: var(--vscode-input-placeholderForeground); }
  .clear {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    padding: 0;
    display: none;
    width: 14px;
  }
  .clear:hover { color: var(--vscode-input-foreground); }

  .list { flex: 1 1 auto; overflow-y: auto; padding-bottom: 8px; }
  details { border: none; margin: 0; padding: 0; }
  summary {
    list-style: none;
    cursor: pointer;
    padding: 3px 8px 3px 4px;
    font-weight: 400;
    color: var(--vscode-foreground);
    user-select: none;
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 3px;
  }
  summary:hover { background: var(--vscode-list-hoverBackground); }
  summary::-webkit-details-marker { display: none; }
  .group-chevron {
    font-size: 14px;
    width: 16px;
    text-align: center;
    flex: 0 0 auto;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    transition: transform 0.1s ease;
  }
  details[open] > summary .group-chevron { transform: rotate(90deg); }
  .group-folder-icon {
    font-size: 14px;
    width: 16px;
    text-align: center;
    flex: 0 0 auto;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
  }
  .group-count { color: var(--vscode-descriptionForeground); font-weight: 400; margin-left: auto; }

  .server-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 24px;
    cursor: pointer;
    border-radius: 3px;
  }
  .server-row:hover { background: var(--vscode-list-hoverBackground); }
  .server-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    opacity: 0.85;
  }
  .hostname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ip { color: var(--vscode-descriptionForeground); font-size: 12px; margin-left: auto; flex: 0 0 auto; }
  .actions { display: flex; gap: 2px; flex: 0 0 auto; opacity: 0; }
  .server-row:hover .actions { opacity: 1; }
  .act {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    padding: 2px 4px;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
  }
  .act .codicon { font-size: 14px; }
  .act:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }

  .empty { padding: 16px 12px; color: var(--vscode-descriptionForeground); text-align: center; }
</style>
</head>
<body>
<div class="toolbar">
  <div class="project-row">
    <div class="project-name" id="projectName">No project selected</div>
    <button class="btn-asset-table" id="btnAssetTable" title="Open Asset Table">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
      Asset Table
    </button>
  </div>
  <div class="pane-subtitle">Servers only &mdash; open Asset Table for all assets</div>
  <div class="hint" id="hint" style="display:none;">No active project — use the toolbar above to create one.</div>
  <div class="search-row">
    <input type="text" id="q" placeholder="Search servers…" autocomplete="off" spellcheck="false" />
    <button class="clear" id="btnClear" title="Clear">&#10005;</button>
  </div>
</div>
<div class="list" id="list"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const projectNameEl = document.getElementById('projectName');
  const hintEl = document.getElementById('hint');
  const q = document.getElementById('q');
  const btnClear = document.getElementById('btnClear');
  const listEl = document.getElementById('list');

  document.getElementById('btnAssetTable').addEventListener('click', () => {
    vscode.postMessage({ type: 'openAssetTable' });
  });

  let allServers = [];
  let groupBy = 'company';

  q.addEventListener('input', () => {
    btnClear.style.display = q.value ? 'block' : 'none';
    applyFilterAndRender();
  });
  btnClear.addEventListener('click', () => {
    q.value = '';
    btnClear.style.display = 'none';
    applyFilterAndRender();
    q.focus();
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'update') {
      allServers = msg.servers || [];
      groupBy = msg.groupBy || 'company';
      projectNameEl.textContent = msg.projectName || 'No project selected';
      hintEl.style.display = msg.projectName ? 'none' : 'block';
      applyFilterAndRender();
    }
  });

  function applyFilterAndRender() {
    const term = q.value.trim().toLowerCase();
    const filtered = term ? allServers.filter((s) => matches(s, term)) : allServers;
    renderList(filtered, !!term);
  }

  function matches(s, term) {
    return (
      (s.hostname || '').toLowerCase().includes(term) ||
      (s.privateIp || '').toLowerCase().includes(term) ||
      (s.application || '').toLowerCase().includes(term) ||
      (s.fqdn || '').toLowerCase().includes(term)
    );
  }

  function groupKey(s) {
    return s[groupBy] || 'Unknown';
  }

  function statusMeaning(status) {
    const st = (status || '').toLowerCase();
    if (st.includes('running with power')) return 'running, power flagged';
    if (st.includes('running')) return 'running';
    return 'not running';
  }

  function renderRow(s) {
    const isWindows = s.os === 'windows';
    const row = document.createElement('div');
    row.className = 'server-row';

    const icon = document.createElement('span');
    icon.className = 'server-icon';
    icon.innerHTML = isWindows
      ? \`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-label="Windows">
           <rect x="1" y="1" width="10" height="10" fill="currentColor" rx="1"/>
           <rect x="13" y="1" width="10" height="10" fill="currentColor" rx="1"/>
           <rect x="1" y="13" width="10" height="10" fill="currentColor" rx="1"/>
           <rect x="13" y="13" width="10" height="10" fill="currentColor" rx="1"/>
         </svg>\`
      : \`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Linux">
           <rect x="2" y="3" width="20" height="18" rx="2"/>
           <path d="M8 9l4 4-4 4"/>
           <path d="M14 17h4"/>
         </svg>\`;
    row.appendChild(icon);

    const host = document.createElement('span');
    host.className = 'hostname';
    host.textContent = s.hostname;
    row.appendChild(host);

    const ip = document.createElement('span');
    ip.className = 'ip';
    ip.textContent = s.privateIp;
    row.appendChild(ip);

    const actions = document.createElement('span');
    actions.className = 'actions';

    if (isWindows) {
      const rdpBtn = document.createElement('button');
      rdpBtn.className = 'act';
      rdpBtn.title = 'Open RDP';
      rdpBtn.innerHTML = '<span class="codicon codicon-remote"></span>';
      rdpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openRdp', server: s });
      });

      const copyBtn = document.createElement('button');
      copyBtn.className = 'act';
      copyBtn.title = 'Copy RDP Command';
      copyBtn.innerHTML = '<span class="codicon codicon-clippy"></span>';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'copyRdpCommand', server: s });
      });

      actions.appendChild(rdpBtn);
      actions.appendChild(copyBtn);
      row.addEventListener('click', () => vscode.postMessage({ type: 'openDetail', server: s }));
    } else {
      const sshBtn = document.createElement('button');
      sshBtn.className = 'act';
      sshBtn.title = 'Open SSH Terminal';
      sshBtn.innerHTML = '<span class="codicon codicon-terminal"></span>';
      sshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openSsh', server: s });
      });

      const copyBtn = document.createElement('button');
      copyBtn.className = 'act';
      copyBtn.title = 'Copy SSH Command';
      copyBtn.innerHTML = '<span class="codicon codicon-clippy"></span>';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'copyCommand', server: s });
      });

      actions.appendChild(sshBtn);
      actions.appendChild(copyBtn);
      row.addEventListener('click', () => vscode.postMessage({ type: 'openDetail', server: s }));
    }

    row.appendChild(actions);
    return row;
  }

  function renderList(servers, isFiltering) {
    listEl.innerHTML = '';

    if (servers.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = allServers.length === 0 ? 'No servers loaded.' : 'No servers match your search.';
      listEl.appendChild(div);
      return;
    }

    const groups = new Map();
    for (const s of servers) {
      const key = groupKey(s);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    for (const key of sortedKeys) {
      const bucket = groups.get(key);
      const details = document.createElement('details');
      details.open = isFiltering;

      const summary = document.createElement('summary');

      const chevron = document.createElement('span');
      chevron.className = 'codicon codicon-chevron-right group-chevron';

      const folderIcon = document.createElement('span');
      folderIcon.className =
        'codicon group-folder-icon codicon-' + (isFiltering ? 'folder-opened' : 'folder');

      const label = document.createElement('span');
      label.textContent = key;

      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = '(' + bucket.length + ')';

      summary.appendChild(chevron);
      summary.appendChild(folderIcon);
      summary.appendChild(label);
      summary.appendChild(count);
      details.appendChild(summary);

      details.addEventListener('toggle', () => {
        folderIcon.classList.toggle('codicon-folder', !details.open);
        folderIcon.classList.toggle('codicon-folder-opened', details.open);
      });

      const groupList = document.createElement('div');
      groupList.className = 'group-list';
      for (const s of bucket) groupList.appendChild(renderRow(s));
      details.appendChild(groupList);

      listEl.appendChild(details);
    }
  }

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
