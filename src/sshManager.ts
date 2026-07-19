import * as vscode from 'vscode';
import { Server } from './types';

export interface SshCredentials {
  username?: string;
  sshKeyPath?: string;
  password?: string;
}

export interface RdpCredentials {
  rdpUsername?: string;
  rdpDomain?: string;
  password?: string;
}

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

export function openSshTerminal(server: Server, creds?: SshCredentials) {
  const cmd = buildSshCommand(server, creds);
  const term = vscode.window.createTerminal({
    name: `SSH: ${server.hostname}`,
    iconPath: new vscode.ThemeIcon('terminal'),
  });
  term.show();
  term.sendText(cmd);

  if (creds?.password) {
    vscode.env.clipboard.writeText(creds.password);
    vscode.window.showInformationMessage(
      `$(key) Password copied to clipboard — paste when SSH prompts for a password`
    );
  }
}

export async function copySshCommand(server: Server, creds?: SshCredentials) {
  const cmd = buildSshCommand(server, creds);
  await vscode.env.clipboard.writeText(cmd);
  vscode.window.showInformationMessage(`Copied: ${cmd}`);
}

export function openRdpTerminal(server: Server, creds?: RdpCredentials) {
  const cmd = buildRdpCommand(server, creds);
  const term = vscode.window.createTerminal({
    name: `RDP: ${server.hostname}`,
    iconPath: new vscode.ThemeIcon('remote'),
  });
  term.show();
  term.sendText(cmd);

  if (creds?.password) {
    vscode.env.clipboard.writeText(creds.password);
    vscode.window.showInformationMessage(
      `$(key) Password copied to clipboard — paste when RDP prompts for a password`
    );
  }
}

export async function copyRdpCommand(server: Server, creds?: RdpCredentials) {
  const cmd = buildRdpCommand(server, creds);
  await vscode.env.clipboard.writeText(cmd);
  vscode.window.showInformationMessage(`Copied: ${cmd}`);
}
