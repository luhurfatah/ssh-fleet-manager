import * as vscode from 'vscode';
import { Project, ProjectManager } from './projectManager';

export class ProjectNode extends vscode.TreeItem {
  constructor(readonly project: Project, isActive: boolean) {
    super(project.name, vscode.TreeItemCollapsibleState.None);

    const fileName =
      project.jsonFilePath?.split('/').pop() ?? project.jsonFilePath?.split('\\').pop();
    this.description = fileName ?? 'No file loaded';
    this.tooltip = project.jsonFilePath ?? 'No JSON file loaded';
    this.contextValue = isActive ? 'activeProject' : 'project';
    this.iconPath = isActive
      ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('circle-outline');

    this.command = {
      command: 'sshFleetManager.editProjectCredentials',
      title: 'Open Project Settings',
      arguments: [this],
    };
  }
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly pm: ProjectManager) {}

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectNode) {
    return element;
  }

  getChildren(): ProjectNode[] {
    const activeId = this.pm.activeProject?.id;
    return this.pm.projects.map((p) => new ProjectNode(p, p.id === activeId));
  }
}
