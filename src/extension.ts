import * as vscode from 'vscode';
import { pickAndLoadFile, loadFile } from './serverLoader';
import { openSshTerminal, copySshCommand } from './sshManager';
import { ExcludeRule, GroupBy, Server } from './types';
import { ProjectManager } from './projectManager';
import { ProjectsTreeProvider, ProjectNode } from './projectsTreeProvider';
import { ServersViewProvider } from './serversViewProvider';
import { openProjectDetailsPanel } from './projectDetailsPanel';

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
  let allServers: Server[] = [];

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

  function refreshViews() {
    allServers = applyExcludeRules(rawServers, pm.activeProject?.excludeRules);
    serversProvider.setServers(allServers);
    serversProvider.setProjectName(pm.activeProject?.name);
    serversProvider.setGroupByField(computeGroupByField());
    projectsProvider.refresh();
  }

  async function loadActiveProjectFile(): Promise<void> {
    const active = pm.activeProject;
    if (active?.jsonFilePath) {
      try {
        rawServers = await loadFile(active.jsonFilePath);
      } catch {
        rawServers = [];
        vscode.window.showWarningMessage(
          `Could not load JSON for "${active.name}". Use Load JSON File to reload.`
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

  // ── Load File ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sshFleetManager.loadFile', async () => {
      try {
        let active = pm.activeProject;
        if (!active) {
          const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for this project',
            placeHolder: 'e.g. Production, Staging, Client A',
            validateInput: (v) => (v.trim() ? undefined : 'Project name cannot be empty'),
          });
          if (!name) return;
          active = await pm.createProject(name.trim());
        }
        const result = await pickAndLoadFile();
        if (!result) return;
        await pm.updateJsonFilePath(active.id, result.filePath);
        rawServers = result.servers;
        refreshViews();
        vscode.window.showInformationMessage(`Loaded ${result.servers.length} Linux servers`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to load file: ${err}`);
      }
    })
  );

  // ── Refresh ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sshFleetManager.refresh', async () => {
      const filePath = pm.activeProject?.jsonFilePath;
      if (!filePath) {
        vscode.window.showWarningMessage('No JSON file loaded. Use "Load JSON File" first.');
        return;
      }
      try {
        rawServers = await loadFile(filePath);
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
      const loadNow = await vscode.window.showInformationMessage(
        `Project "${project.name}" created.`,
        'Load JSON File',
        'Later'
      );
      if (loadNow === 'Load JSON File') {
        await vscode.commands.executeCommand('sshFleetManager.loadFile');
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

  // ── Load JSON for a specific project (context menu) ───────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sshFleetManager.loadFileForProject',
      async (node: ProjectNode) => {
        if (!node?.project) return;
        if (node.project.id !== pm.activeProject?.id) {
          await pm.setActiveProject(node.project.id);
          rawServers = [];
          refreshViews();
        }
        await vscode.commands.executeCommand('sshFleetManager.loadFile');
      }
    )
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
      }
    })
  );

  context.subscriptions.push(projectsView);
}

export function deactivate() {}
