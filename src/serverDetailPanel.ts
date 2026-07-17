import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Server } from './types';
import { SshCredentials, RdpCredentials } from './sshManager';

const openPanels = new Map<string, vscode.WebviewPanel>();

function buildSshCommand(server: Server, creds?: SshCredentials): string {
  const config = vscode.workspace.getConfiguration('sshFleetManager');
  const user = creds?.username || config.get<string>('defaultUser', 'ec2-user');
  const keyPath = creds?.sshKeyPath ?? config.get<string>('sshKeyPath', '');
  const keyFlag = keyPath ? ` -i "${keyPath}"` : '';
  return `ssh${keyFlag} ${user}@${server.privateIp}`;
}

function buildRdpCommand(server: Server, creds?: RdpCredentials): string {
  const user = creds?.rdpUsername;
  const domain = creds?.rdpDomain;
  let userFlag = '';
  if (user) {
    userFlag = domain ? ` /u:${domain}\\${user}` : ` /u:${user}`;
  }
  return `mstsc.exe /v:${server.privateIp}${userFlag}`;
}

export function openServerDetailPanel(
  server: Server,
  creds: { ssh?: SshCredentials; rdp?: RdpCredentials },
  extensionUri: vscode.Uri
): void {
  const key = server.hostname;
  const existing = openPanels.get(key);
  if (existing) {
    existing.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'sshFleetManagerServerDetail',
    server.hostname,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.iconPath = new vscode.ThemeIcon('server');
  openPanels.set(key, panel);

  let linkedTerminal: vscode.Terminal | undefined;

  const termListener = vscode.window.onDidCloseTerminal((t) => {
    if (t === linkedTerminal) {
      linkedTerminal = undefined;
      panel.webview.postMessage({ type: 'sessionEnded' });
    }
  });

  panel.onDidDispose(() => {
    openPanels.delete(key);
    termListener.dispose();
    if (linkedTerminal) {
      linkedTerminal.dispose();
      linkedTerminal = undefined;
    }
  });

  panel.webview.html = getHtml(crypto.randomBytes(16).toString('hex'), server);

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'openSsh': {
        const cmd = buildSshCommand(server, creds.ssh);
        const term = vscode.window.createTerminal({
          name: `SSH: ${server.hostname}`,
          iconPath: new vscode.ThemeIcon('terminal'),
        });
        linkedTerminal = term;
        term.show();
        term.sendText(cmd);
        if (creds.ssh?.password) {
          await vscode.env.clipboard.writeText(creds.ssh.password);
          vscode.window.showInformationMessage(
            `$(key) Password copied to clipboard — paste when SSH prompts for a password`
          );
        }
        panel.webview.postMessage({ type: 'sessionStarted', termName: `SSH: ${server.hostname}` });
        break;
      }
      case 'copySsh': {
        const cmd = buildSshCommand(server, creds.ssh);
        await vscode.env.clipboard.writeText(cmd);
        vscode.window.showInformationMessage(`Copied: ${cmd}`);
        break;
      }
      case 'openRdp': {
        const cmd = buildRdpCommand(server, creds.rdp);
        const term = vscode.window.createTerminal({
          name: `RDP: ${server.hostname}`,
          iconPath: new vscode.ThemeIcon('remote'),
        });
        linkedTerminal = term;
        term.show();
        term.sendText(cmd);
        if (creds.rdp?.password) {
          await vscode.env.clipboard.writeText(creds.rdp.password);
          vscode.window.showInformationMessage(
            `$(key) Password copied to clipboard — paste when RDP prompts for a password`
          );
        }
        break;
      }
      case 'copyRdp': {
        const cmd = buildRdpCommand(server, creds.rdp);
        await vscode.env.clipboard.writeText(cmd);
        vscode.window.showInformationMessage(`Copied: ${cmd}`);
        break;
      }
      case 'focusTerminal': {
        linkedTerminal?.show();
        break;
      }
    }
  });
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getHtml(nonce: string, server: Server): string {
  const isWindows = server.os === 'windows';
  const isRunning = (server.status || '').toLowerCase().includes('running');
  const statusLabel = isRunning ? 'Running' : (server.status || 'Unknown');

  const val = (v: string) => v && v !== '-' ? v : null;

  type Group = { title: string; rows: [string, string, boolean?][] };
  type R = [string, string, boolean?];
  const r = (label: string, value: string | null | undefined, flag?: boolean): R | null =>
    value && value !== '-' ? [label, value, flag] : null;

  const groups: Group[] = [
    {
      title: 'Network',
      rows: [
        ['IP Address', server.privateIp],
        r('FQDN',          server.fqdn),
        r('Instance ID',   server.instanceId),
        r('Instance Type', server.instanceType),
        r('OS Version',    server.osVersion),
        server.status ? ['Status', statusLabel, isRunning] as R : null,
        r('Role',          server.generalRole),
      ].filter((x): x is R => x !== null),
    },
    {
      title: 'Application',
      rows: [
        r('Application', server.application),
        r('Company',     server.company),
        r('SBU',         server.sbu),
        r('Account',     server.accountName),
      ].filter((x): x is R => x !== null),
    },
    {
      title: 'Ownership',
      rows: [
        r('Owner', server.owner),
        r('Email', server.ownerEmail),
        r('PIC',   server.serverPic),
      ].filter((x): x is R => x !== null),
    },
  ].filter(g => g.rows.length > 0);

  const monoFields = new Set(['IP Address', 'FQDN', 'Instance ID', 'Instance Type']);

  const groupsHtml = groups.map(g => `
    <div class="card">
      <div class="card-title">${g.title}</div>
      <dl class="detail-grid">
        ${g.rows.map(([label, value, isStatus]) => {
          const dot = isStatus !== undefined
            ? `<span class="dot ${isStatus ? 'dot-on' : 'dot-off'}"></span>`
            : '';
          const mono = monoFields.has(label) ? ' mono' : '';
          return `<div class="detail-row">
            <dt>${esc(label)}</dt>
            <dd class="${mono}">${dot}${esc(value)}</dd>
          </div>`;
        }).join('\n')}
      </dl>
    </div>`).join('\n');

  const terminalSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 9l4 4-4 4"/><path d="M14 17h4"/></svg>`;
  const copySvg    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const remoteSvg  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.5;
  }

  /* ── Hero ───────────────────────────────────────────── */
  .hero {
    padding: 28px 28px 22px;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.06));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
  }
  .hero-badges {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 20px;
    letter-spacing: 0.2px;
    line-height: 1;
  }
  .badge-win {
    background: rgba(0,120,212,0.18);
    color: #60b0f4;
    border: 1px solid rgba(0,120,212,0.3);
  }
  .badge-lin {
    background: rgba(76,175,80,0.15);
    color: #81c784;
    border: 1px solid rgba(76,175,80,0.25);
  }
  .badge-running {
    background: rgba(76,175,80,0.12);
    color: #81c784;
    border: 1px solid rgba(76,175,80,0.22);
  }
  .badge-stopped {
    background: rgba(128,128,128,0.1);
    color: var(--vscode-descriptionForeground);
    border: 1px solid rgba(128,128,128,0.2);
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex: 0 0 auto;
    display: inline-block;
  }
  .dot-on  { background: #4caf50; }
  .dot-off { background: #888; }

  .hero h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.3px;
    line-height: 1.2;
    margin-bottom: 5px;
    word-break: break-all;
  }
  .hero-ip {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  /* ── Action bar ─────────────────────────────────────── */
  .action-bar {
    display: flex;
    gap: 8px;
    padding: 14px 28px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    flex-wrap: wrap;
  }
  button {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    border: none;
    border-radius: 4px;
    padding: 7px 16px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.12s, opacity 0.12s;
    line-height: 1;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-ghost {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
  }
  .btn-ghost:hover { background: var(--vscode-list-hoverBackground); }
  .btn-sm {
    font-size: 12px;
    padding: 5px 12px;
  }

  /* ── Body ───────────────────────────────────────────── */
  .body { padding: 20px 28px; display: flex; flex-direction: column; gap: 16px; }

  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    border-radius: 6px;
    overflow: hidden;
  }
  .card-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    color: var(--vscode-descriptionForeground);
    padding: 9px 14px;
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.05));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  }
  .detail-grid { display: flex; flex-direction: column; }
  .detail-row {
    display: grid;
    grid-template-columns: 130px 1fr;
    padding: 7px 14px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.08));
  }
  .detail-row:last-child { border-bottom: none; }
  dt {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    padding-right: 12px;
    padding-top: 1px;
  }
  dd { color: var(--vscode-foreground); word-break: break-word; display: flex; align-items: center; gap: 6px; }
  dd.mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }

  /* ── Session card ───────────────────────────────────── */
  .session-card { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18)); border-radius: 6px; overflow: hidden; }
  .session-body { padding: 14px; }
  .session-state { display: flex; align-items: center; gap: 10px; }
  .session-label { font-weight: 600; }
  .session-hint { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 6px; }
  .session-term {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    background: rgba(128,128,128,0.12);
    padding: 2px 8px;
    border-radius: 3px;
    margin-top: 6px;
    display: inline-block;
  }
  .session-actions { margin-top: 10px; }

  .dot-lg { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
  .dot-lg.on  { background: #4caf50; }
  .dot-lg.off { background: #666; }
  .dot-lg.ended { background: #e57373; }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(76,175,80,0.5); }
    50%       { box-shadow: 0 0 0 5px rgba(76,175,80,0); }
  }
  .dot-pulse { animation: pulse 2s ease-in-out infinite; }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-badges">
    <span class="badge ${isWindows ? 'badge-win' : 'badge-lin'}">${isWindows ? 'Windows' : 'Linux'}</span>
    <span class="badge ${isRunning ? 'badge-running' : 'badge-stopped'}">
      <span class="dot ${isRunning ? 'dot-on' : 'dot-off'}"></span>
      ${esc(statusLabel)}
    </span>
  </div>
  <h1>${esc(server.hostname)}</h1>
  <div class="hero-ip">${esc(server.privateIp)}</div>
</div>

<div class="action-bar">
${isWindows ? `
  <button class="btn-primary" id="btnOpen">${remoteSvg} Open RDP Connection</button>
  <button class="btn-ghost"   id="btnCopy">${copySvg} Copy RDP Command</button>
` : `
  <button class="btn-primary" id="btnOpen">${terminalSvg} Open SSH Terminal</button>
  <button class="btn-ghost"   id="btnCopy">${copySvg} Copy SSH Command</button>
`}
</div>

<div class="body">
  ${groupsHtml}

${!isWindows ? `
  <div class="session-card" id="sessionCard">
    <div class="card-title">SSH Session</div>
    <div class="session-body" id="sessionBody">
      <div class="session-state">
        <span class="dot-lg off" id="sessionDot"></span>
        <span class="session-label" id="sessionLabel">No active session</span>
      </div>
      <div class="session-hint" id="sessionHint">Click "Open SSH Terminal" to start a session.</div>
    </div>
  </div>
` : ''}
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  document.getElementById('btnOpen').addEventListener('click', () => {
    vscode.postMessage({ type: '${isWindows ? 'openRdp' : 'openSsh'}' });
  });
  document.getElementById('btnCopy').addEventListener('click', () => {
    vscode.postMessage({ type: '${isWindows ? 'copyRdp' : 'copySsh'}' });
  });

  ${!isWindows ? `
  const sessionDot   = document.getElementById('sessionDot');
  const sessionLabel = document.getElementById('sessionLabel');
  const sessionHint  = document.getElementById('sessionHint');
  const sessionBody  = document.getElementById('sessionBody');

  function setSession(state, termName) {
    const existing = document.getElementById('sessionExtra');
    if (existing) existing.remove();
    const extra = document.createElement('div');
    extra.id = 'sessionExtra';

    if (state === 'active') {
      sessionDot.className = 'dot-lg on dot-pulse';
      sessionLabel.textContent = 'Session active';
      sessionHint.textContent = '';
      const term = document.createElement('div');
      term.className = 'session-term';
      term.textContent = termName;
      extra.appendChild(term);
      const actions = document.createElement('div');
      actions.className = 'session-actions';
      const focusBtn = document.createElement('button');
      focusBtn.className = 'btn-ghost btn-sm';
      focusBtn.textContent = 'Show Terminal';
      focusBtn.addEventListener('click', () => vscode.postMessage({ type: 'focusTerminal' }));
      actions.appendChild(focusBtn);
      extra.appendChild(actions);
    } else if (state === 'ended') {
      sessionDot.className = 'dot-lg ended';
      sessionLabel.textContent = 'Session ended';
      sessionHint.textContent = 'The terminal was closed.';
    } else {
      sessionDot.className = 'dot-lg off';
      sessionLabel.textContent = 'No active session';
      sessionHint.textContent = 'Click "Open SSH Terminal" to start a session.';
    }
    sessionBody.appendChild(extra);
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'sessionStarted') setSession('active', msg.termName);
    else if (msg.type === 'sessionEnded') setSession('ended', null);
  });
  ` : ''}
</script>
</body>
</html>`;
}
