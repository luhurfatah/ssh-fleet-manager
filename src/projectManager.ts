import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ExcludeRule, GroupBy } from './types';

export interface ProjectCredentials {
  username?: string;
  sshKeyPath?: string;
}

export interface Project {
  id: string;
  name: string;
  jsonFilePath?: string;
  credentials: ProjectCredentials;
  groupBy?: GroupBy;
  excludeRules?: ExcludeRule[];
}

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
}

export class ProjectManager {
  private state: ProjectsState;

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secrets: vscode.SecretStorage
  ) {
    this.state = globalState.get<ProjectsState>('projectsState', {
      projects: [],
      activeProjectId: null,
    });
  }

  get projects(): Project[] {
    return this.state.projects;
  }

  get activeProject(): Project | undefined {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId);
  }

  async createProject(name: string): Promise<Project> {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      credentials: {},
    };
    this.state.projects.push(project);
    if (!this.state.activeProjectId) {
      this.state.activeProjectId = project.id;
    }
    await this.persist();
    return project;
  }

  async setActiveProject(id: string): Promise<void> {
    if (!this.state.projects.find((p) => p.id === id)) return;
    this.state.activeProjectId = id;
    await this.persist();
  }

  async deleteProject(id: string): Promise<void> {
    await this.secrets.delete(`project:${id}:password`);
    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    if (this.state.activeProjectId === id) {
      this.state.activeProjectId = this.state.projects[0]?.id ?? null;
    }
    await this.persist();
  }

  async updateJsonFilePath(projectId: string, filePath: string): Promise<void> {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.jsonFilePath = filePath || undefined;
    await this.persist();
  }

  async renameProject(projectId: string, name: string): Promise<void> {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.name = name;
    await this.persist();
  }

  async setGroupBy(projectId: string, groupBy: GroupBy | undefined): Promise<void> {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.groupBy = groupBy;
    await this.persist();
  }

  async setExcludeRules(projectId: string, rules: ExcludeRule[]): Promise<void> {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.excludeRules = rules.length > 0 ? rules : undefined;
    await this.persist();
  }

  async setCredentials(
    projectId: string,
    creds: ProjectCredentials,
    password?: string
  ): Promise<void> {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.credentials = creds;
    if (password !== undefined) {
      if (password) {
        await this.secrets.store(`project:${projectId}:password`, password);
      } else {
        await this.secrets.delete(`project:${projectId}:password`);
      }
    }
    await this.persist();
  }

  async getPassword(projectId: string): Promise<string | undefined> {
    return this.secrets.get(`project:${projectId}:password`);
  }

  private async persist(): Promise<void> {
    await this.globalState.update('projectsState', this.state);
  }
}
