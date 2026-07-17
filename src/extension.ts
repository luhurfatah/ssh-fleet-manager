import * as vscode from 'vscode';
import { loadFile } from './serverLoader';
import { openSshTerminal, copySshCommand, openRdpTerminal, copyRdpCommand } from './sshManager';
import { ExcludeRule, GroupBy, Server } from './types';
import { ProjectManager } from './projectManager';
import { ProjectsTreeProvider, ProjectNode } from './projectsTreeProvider';
import { ServersViewProvider } from './serversViewProvider';
import { openProjectDetailsPanel } from './projectDetailsPanel';
import { openServerDetailPanel } from './serverDetailPanel';
import { openJsonVisualizerPanel, updateJsonVisualizerPanel } from './jsonVisualizerPanel';

function applyExcludeRules(servers: Server[], rules: ExcludeRule[] | undefined): Server[] {
  if (!rules || rules.length === 0) return servers;
  return servers.filter(
    (s) =>
      !rules.some(
        (r) => String(s[r.field as keyof Server] ?? '').toLowerCase() === r.value.toLowerCase()
      )
  );
}

export function activate(context: vscode.ExtensionContext) {
  const pm = new ProjectManager(context.globalState, context.secrets);
  const projectsProvider = new ProjectsTreeProvider(pm);
  const serversProvider = new ServersViewProvider(context.extensionUri);

  let rawServers: Server[] = [];
  let allAssets: Server[] = [];  // all records after exclude rules → Asset Table
  let allServers: Server[] = []; // server-class records only → Servers pane

  // ── Register views ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ServersViewProvider.viewId, serversProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const projectsView = vscode.window.createTreeView('sshFleetManagerProjects', {
    treeDataProvider: projectsProvider,
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function computeGroupByField(): GroupBy {
    const active = pm.activeProject;
    if (active?.groupBy) return active.groupBy;
    return vscode.workspace.getConfiguration('sshFleetManager').get<GroupBy>('groupBy', 'company');
  }

  function isServerEntry(s: Server): boolean {
    return s.serverClass.toLowerCase() !== 'database';
  }

  function refreshViews() {
    allAssets = applyExcludeRules(rawServers, pm.activeProject?.excludeRules);
    allServers = allAssets.filter(isServerEntry);
    serversProvider.setServers(allServers);
    serversProvider.setProjectName(pm.activeProject?.name);
    serversProvider.setGroupByField(computeGroupByField());
    projectsProvider.refresh();
    updateJsonVisualizerPanel(allAssets);
  }

  async function loadActiveProjectFile(): Promise<void> {
    const active = pm.activeProject;
    if (active?.jsonFilePath) {
      try {
        rawServers = await loadFile(active.jsonFilePath, active.xlsxSheet);
      } catch {
        rawServers = [];
        vscode.window.showWarningMessage(
          `Could not load asset file for "${active.name}". Open Project Settings to update the file path.`
        );
      }
    } else {
      rawServers = [];
    }
    refreshViews();
  }

  async function doSwitchToProject(projectId: string): Promise<void> {
    await pm.setActiveProject(projectId);
    await loadActiveProjectFile();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sshFleetManager.groupBy') && !pm.activeProject?.groupBy) {
        serversProvider.setGroupByField(computeGroupByField());
      }
    })
  );

  // ── Auto-load on startup ──────────────────────────────────────────────────
  loadActiveProjectFile();

  // ── Refresh ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sshFleetManager.refresh', async () => {
      const active = pm.activeProject;
      const filePath = active?.jsonFilePath;
      if (!filePath) {
        vscode.window.showWarningMessage('No file loaded. Open Project Settings to set a data source.');
        return;
      }
      try {
        rawServers = await loadFile(filePath, active?.xlsxSheet);
        refreshViews();
        vscode.window.showInformationMessage(`Refreshed: ${allServers.length} servers`);
      } catch (err) {
        vscode.window.showErrorMessage(`Refresh failed: ${err}`);
      }
    })
  );

  // ── Create Project ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sshFleetManager.createProject', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new project',
        placeHolder: 'e.g. Production, Staging, Client A',
        validateInput: (v) => (v.trim() ? undefined : 'Project name cannot be empty'),
      });
      if (!name) return;
      const project = await pm.createProject(name.trim());
      await doSwitchToProject(project.id);
      const openNow = await vscode.window.showInformationMessage(
        `Project "${project.name}" created.`,
        'Open Settings',
        'Later'
      );
      if (openNow === 'Open Settings') {
        await vscode.commands.executeCommand('sshFleetManager.editProjectCredentials');
      }
    })
  );

  // ── Switch to Project (from projects tree click) ──────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sshFleetManager.switchToProject',
      async (arg: string | ProjectNode) => {
        const projectId = typeof arg === 'string' ? arg : arg?.project?.id;
        if (!projectId || projectId === pm.activeProject?.id) return;
        await doSwitchToProject(projectId);
        vscode.window.showInformationMessage(`Switched to project "${pm.activeProject?.name}"`);
      }
    )
  );

  // ── Switch Project (QuickPick — command palette) ───────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sshFleetManager.switchProject', async () => {
      const projects = pm.projects;
      if (projects.length === 0) {
        vscode.window.showWarningMessage('No projects yet. Create one first.');
        return;
      }
      const active = pm.activeProject;
      type Item = vscode.QuickPickItem & { projectId: string };
      const items: Item[] = projects.map((p) => ({
        label: p.id === active?.id ? `$(check) ${p.name}` : p.name,
        description: p.jsonFilePath ?? 'No JSON file loaded',
        projectId: p.id,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a project to switch to',
      });
      if (!picked || picked.projectId === active?.id) return;
      await doSwitchToProject(picked.projectId);
      vscode.window.showInformationMessage(`Switched to "${pm.activeProject?.name}"`);
    })
  );

  // ── Edit Project Details (opens a new editor pane) ─────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sshFleetManager.editProjectCredentials',
      async (node?: ProjectNode) => {
        const project = node?.project ?? pm.activeProject;
        if (!project) {
          vscode.window.showWarningMessage('No active project. Create a project first.');
          return;
        }
        await openProjectDetailsPanel(pm, project.id, () => {
          if (project.id === pm.activeProject?.id) {
            loadActiveProjectFile();
          } else {
            refreshViews();
          }
        });
      }
    )
  );

  // ── Delete Project ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sshFleetManager.deleteProject',
      async (node?: ProjectNode) => {
        const project = node?.project ?? pm.activeProject;
        if (!project) {
          vscode.window.showWarningMessage('No active project to delete.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Delete project "${project.name}"? This cannot be undone.`,
          { modal: true },
          'Delete'
        );
        if (confirm !== 'Delete') return;

        await pm.deleteProject(project.id);
        await loadActiveProjectFile();

        const next = pm.activeProject;
        vscode.window.showInformationMessage(
          next ? `Deleted. Now on project "${next.name}".` : 'Project deleted.'
        );
      }
    )
  );

  // ── Open JSON Visualizer ───────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sshFleetManager.openVisualizer', () => {
      openJsonVisualizerPanel(allAssets, pm.activeProject?.defaultFilterField, pm.activeProject?.defaultFilterValue);
    })
  );

  // ── Messages from the Servers webview ──────────────────────────────────────
  context.subscriptions.push(
    serversProvider.onMessage(async (msg) => {
      switch (msg.type) {
        case 'openSsh': {
          const active = pm.activeProject;
          const password = active ? await pm.getPassword(active.id) : undefined;
          openSshTerminal(msg.server, { ...active?.credentials, password });
          break;
        }
        case 'copyCommand': {
          const active = pm.activeProject;
          await copySshCommand(msg.server, active?.credentials);
          break;
        }
        case 'openRdp': {
          const active = pm.activeProject;
          const password = active ? await pm.getPassword(active.id) : undefined;
          openRdpTerminal(msg.server, { ...active?.credentials, password });
          break;
        }
        case 'copyRdpCommand': {
          const active = pm.activeProject;
          await copyRdpCommand(msg.server, active?.credentials);
          break;
        }
        case 'openDetail': {
          const active = pm.activeProject;
          const password = active ? await pm.getPassword(active.id) : undefined;
          openServerDetailPanel(
            msg.server,
            {
              ssh: { ...active?.credentials, password },
              rdp: {
                rdpUsername: active?.credentials?.rdpUsername,
                rdpDomain: active?.credentials?.rdpDomain,
                password,
              },
            },
            context.extensionUri
          );
          break;
        }
      }
    })
  );

  context.subscriptions.push(projectsView);
}

export function deactivate() {}
