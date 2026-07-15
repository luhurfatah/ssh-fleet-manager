import * as vscode from 'vscode';
import { Server } from './types';

export interface SshCredentials {
  username?: string;
  sshKeyPath?: string;
  password?: string;
}

function buildCommand(server: Server, creds?: SshCredentials): string {
  const config = vscode.workspace.getConfiguration('sshFleetManager');
  const user = creds?.username || config.get<string>('defaultUser', 'ec2-user');
  const keyPath = creds?.sshKeyPath ?? config.get<string>('sshKeyPath', '');

  const keyFlag = keyPath ? ` -i "${keyPath}"` : '';
  return `ssh${keyFlag} ${user}@${server.privateIp}`;
}

export function openSshTerminal(server: Server, creds?: SshCredentials) {
  const cmd = buildCommand(server, creds);
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
  const cmd = buildCommand(server, creds);
  await vscode.env.clipboard.writeText(cmd);
  vscode.window.showInformationMessage(`Copied: ${cmd}`);
}
