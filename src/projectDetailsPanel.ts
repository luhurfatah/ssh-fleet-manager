import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ProjectManager } from './projectManager';
import { ExcludeRule, GROUPABLE_FIELDS, GroupBy, Server } from './types';
import { loadFile } from './serverLoader';

const openPanels = new Map<string, vscode.WebviewPanel>();

async function computeDistinctValues(
  jsonFilePath: string | undefined
): Promise<Record<string, string[]>> {
  if (!jsonFilePath) return {};
  try {
    const servers = await loadFile(jsonFilePath);
    const result: Record<string, string[]> = {};
    for (const f of GROUPABLE_FIELDS) {
      const values = new Set<string>();
      for (const s of servers) {
        const v = s[f.value as keyof Server];
        if (v) values.add(String(v));
      }
      result[f.value] = Array.from(values).sort((a, b) => a.localeCompare(b));
    }
    return result;
  } catch {
    return {};
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
  openPanels.set(projectId, panel);
  panel.onDidDispose(() => openPanels.delete(projectId));

  const hasPassword = !!(await pm.getPassword(projectId));
  const distinctValuesByField = await computeDistinctValues(project.jsonFilePath);

  panel.webview.html = getHtml(crypto.randomBytes(16).toString('hex'), {
    name: project.name,
    jsonFilePath: project.jsonFilePath ?? '',
    username: project.credentials.username ?? '',
    sshKeyPath: project.credentials.sshKeyPath ?? '',
    groupBy: project.groupBy ?? '',
    excludeRules: project.excludeRules ?? [],
    distinctValuesByField,
    hasPassword,
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'browseJson') {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] },
        title: 'Select MAL JSON file',
      });
      if (uris?.[0]) {
        panel.webview.postMessage({ type: 'setJsonFilePath', value: uris[0].fsPath });
        const values = await computeDistinctValues(uris[0].fsPath);
        panel.webview.postMessage({ type: 'setDistinctValues', value: values });
      }
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

    if (msg.type === 'save') {
      const name = (msg.name ?? '').trim();
      if (!name) {
        panel.webview.postMessage({ type: 'error', message: 'Project name cannot be empty' });
        return;
      }

      await pm.renameProject(projectId, name);
      await pm.updateJsonFilePath(projectId, (msg.jsonFilePath ?? '').trim());
      await pm.setGroupBy(projectId, (msg.groupBy || undefined) as GroupBy | undefined);

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
  username: string;
  sshKeyPath: string;
  groupBy: string;
  excludeRules: ExcludeRule[];
  distinctValuesByField: Record<string, string[]>;
  hasPassword: boolean;
}

function getHtml(nonce: string, data: ProjectFormData): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    padding: 20px 24px;
    max-width: 560px;
  }
  h2 { margin: 0 0 16px; font-size: 15px; }
  .field { margin-bottom: 14px; }
  label { display: block; margin-bottom: 4px; font-weight: 600; }
  .desc { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 4px; }
  .row { display: flex; gap: 6px; }
  input[type="text"], input[type="password"] {
    width: 100%;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }
  input:focus, select:focus { border-color: var(--vscode-focusBorder); }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  .row input[type="text"] { flex: 1; }
  select {
    width: 100%;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 2px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }
  button {
    font-family: inherit;
    font-size: inherit;
    border: none;
    border-radius: 2px;
    padding: 6px 14px;
    cursor: pointer;
  }
  .browse {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    flex: 0 0 auto;
  }
  .browse:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .checkbox-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .checkbox-row label { margin: 0; font-weight: 400; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .primary:hover { background: var(--vscode-button-hoverBackground); }
  .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .error { color: var(--vscode-errorForeground); font-size: 12px; margin-top: 4px; display: none; }
  .saved-badge { color: var(--vscode-charts-green); font-size: 12px; margin-left: 8px; display: none; }

  .exclude-rules-list { margin-bottom: 8px; }
  .exclude-rule-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 4px 8px;
    margin-bottom: 4px;
    font-size: 12px;
  }
  .remove-rule {
    background: none;
    padding: 2px 4px;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
  }
  .remove-rule:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
  .add-rule-row { display: flex; gap: 6px; }
  .add-rule-row select { flex: 0 0 auto; width: auto; }
  .add-rule-row input { flex: 1; }
</style>
</head>
<body>
<h2>Project Details</h2>

<div class="field">
  <label for="name">Project Name</label>
  <input type="text" id="name" value="${esc(data.name)}" placeholder="e.g. Production, Staging, Client A" />
  <div class="error" id="nameError">Project name cannot be empty</div>
</div>

<div class="field">
  <label for="jsonFilePath">MAL JSON File</label>
  <div class="row">
    <input type="text" id="jsonFilePath" value="${esc(data.jsonFilePath)}" placeholder="No file selected" />
    <button class="browse" id="browseJson">Browse…</button>
  </div>
</div>

<div class="field">
  <label for="groupBy">Group Servers By</label>
  <div class="desc">Which column from this project's JSON to group the server list by.</div>
  <select id="groupBy">
    <option value="">(Use global default)</option>
    ${GROUPABLE_FIELDS.map(
      (f) =>
        `<option value="${f.value}"${f.value === data.groupBy ? ' selected' : ''}>${f.label}</option>`
    ).join('\n    ')}
  </select>
</div>

<div class="field">
  <label>Exclude Filters</label>
  <div class="desc">Hide servers matching any of these field/value pairs from the list.</div>
  <div class="exclude-rules-list" id="excludeRulesList"></div>
  <div class="add-rule-row">
    <select id="excludeField">
      ${GROUPABLE_FIELDS.map((f) => `<option value="${f.value}">${f.label}</option>`).join('\n      ')}
    </select>
    <input type="text" id="excludeValue" list="excludeValueOptions" placeholder="Value to exclude" />
    <datalist id="excludeValueOptions"></datalist>
    <button class="browse" id="addExcludeRule">Add</button>
  </div>
</div>

<div class="field">
  <label for="username">SSH Username</label>
  <div class="desc">Leave blank to use the global "sshFleetManager.defaultUser" setting.</div>
  <input type="text" id="username" value="${esc(data.username)}" placeholder="e.g. ec2-user, ubuntu, admin" />
</div>

<div class="field">
  <label for="sshKeyPath">SSH Key Path</label>
  <div class="desc">Leave blank to use the global "sshFleetManager.sshKeyPath" setting.</div>
  <div class="row">
    <input type="text" id="sshKeyPath" value="${esc(data.sshKeyPath)}" placeholder="e.g. ~/.ssh/id_rsa" />
    <button class="browse" id="browseKey">Browse…</button>
  </div>
</div>

<div class="field">
  <label for="password">Password</label>
  <div class="desc">Stored securely in your OS keychain. ${
    data.hasPassword ? 'A password is currently set.' : 'No password is currently set.'
  }</div>
  <input type="password" id="password" placeholder="${
    data.hasPassword ? 'Leave blank to keep current password' : 'Leave blank for none (key-based auth)'
  }" />
  <div class="checkbox-row">
    <input type="checkbox" id="clearPassword" ${data.hasPassword ? '' : 'disabled'} />
    <label for="clearPassword">Clear stored password</label>
  </div>
</div>

<div class="actions">
  <button class="primary" id="save">Save</button>
  <button class="secondary" id="cancel">Cancel</button>
  <span class="saved-badge" id="savedBadge">&#10003; Saved</span>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const nameEl = document.getElementById('name');
  const jsonFilePathEl = document.getElementById('jsonFilePath');
  const groupByEl = document.getElementById('groupBy');
  const usernameEl = document.getElementById('username');
  const sshKeyPathEl = document.getElementById('sshKeyPath');
  const passwordEl = document.getElementById('password');
  const clearPasswordEl = document.getElementById('clearPassword');
  const nameError = document.getElementById('nameError');
  const savedBadge = document.getElementById('savedBadge');

  const fieldLabels = ${JSON.stringify(
    Object.fromEntries(GROUPABLE_FIELDS.map((f) => [f.value, f.label]))
  ).replace(/</g, '\\u003c')};
  let distinctValuesByField = ${JSON.stringify(data.distinctValuesByField).replace(/</g, '\\u003c')};
  let excludeRules = ${JSON.stringify(data.excludeRules).replace(/</g, '\\u003c')};

  const excludeRulesListEl = document.getElementById('excludeRulesList');
  const excludeFieldEl = document.getElementById('excludeField');
  const excludeValueEl = document.getElementById('excludeValue');
  const excludeValueOptionsEl = document.getElementById('excludeValueOptions');

  function renderExcludeRules() {
    excludeRulesListEl.innerHTML = '';
    if (excludeRules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'desc';
      empty.textContent = 'No exclude filters yet.';
      excludeRulesListEl.appendChild(empty);
      return;
    }
    excludeRules.forEach((rule, idx) => {
      const row = document.createElement('div');
      row.className = 'exclude-rule-row';

      const label = document.createElement('span');
      label.textContent = (fieldLabels[rule.field] || rule.field) + ' = "' + rule.value + '"';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-rule';
      removeBtn.title = 'Remove filter';
      removeBtn.textContent = '\\u2715';
      removeBtn.addEventListener('click', () => {
        excludeRules.splice(idx, 1);
        renderExcludeRules();
      });

      row.appendChild(label);
      row.appendChild(removeBtn);
      excludeRulesListEl.appendChild(row);
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

  document.getElementById('browseJson').addEventListener('click', () => {
    vscode.postMessage({ type: 'browseJson' });
  });
  document.getElementById('browseKey').addEventListener('click', () => {
    vscode.postMessage({ type: 'browseKey' });
  });
  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
  document.getElementById('save').addEventListener('click', () => {
    savedBadge.style.display = 'none';
    if (!nameEl.value.trim()) {
      nameError.style.display = 'block';
      nameEl.focus();
      return;
    }
    nameError.style.display = 'none';
    vscode.postMessage({
      type: 'save',
      name: nameEl.value,
      jsonFilePath: jsonFilePathEl.value,
      groupBy: groupByEl.value,
      excludeRules: excludeRules,
      username: usernameEl.value,
      sshKeyPath: sshKeyPathEl.value,
      password: passwordEl.value,
      clearPassword: clearPasswordEl.checked,
    });
  });

  clearPasswordEl.addEventListener('change', () => {
    passwordEl.disabled = clearPasswordEl.checked;
    if (clearPasswordEl.checked) passwordEl.value = '';
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'setJsonFilePath') jsonFilePathEl.value = msg.value;
    if (msg.type === 'setKeyPath') sshKeyPathEl.value = msg.value;
    if (msg.type === 'setDistinctValues') {
      distinctValuesByField = msg.value;
      updateExcludeValueOptions();
    }
    if (msg.type === 'error') {
      nameError.textContent = msg.message;
      nameError.style.display = 'block';
    }
    if (msg.type === 'saved') {
      savedBadge.style.display = 'inline';
      setTimeout(() => (savedBadge.style.display = 'none'), 2000);
    }
  });
</script>
</body>
</html>`;
}
