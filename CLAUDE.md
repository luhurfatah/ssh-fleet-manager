# ssh-fleet-manager

VS Code extension that organizes server fleets into projects. Each project owns a MAL (Master
Asset List) JSON inventory file, SSH credentials, a grouping category, and exclude filters — all
persisted across sessions. Provides a sidebar for browsing/searching/filtering servers and
SSH-ing into them.

## Build

```bash
npm install          # first time only
node esbuild.js      # build → dist/extension.js
npx tsc --noEmit     # type-check only (no output)
node esbuild.js --watch   # rebuild on change
```

## Run / Debug

Open this folder as the VS Code workspace root, then press **F5**. This launches the Extension
Development Host with the extension loaded.

The `.vscode/tasks.json` default build task runs `node esbuild.js` before launch.

## Package

```bash
npm run package       # vsce package → ssh-fleet-manager-<version>.vsix
```

Install the resulting `.vsix` via the Extensions panel's `...` menu → **Install from VSIX...**,
or `code --install-extension ssh-fleet-manager-<version>.vsix`.

Note: `@vscode/vsce` is pinned to `2.15.0` with a `cheerio` npm override (`1.0.0-rc.12`) because
the latest vsce/cheerio/undici chain requires Node 20+'s global `File` API, which isn't available
under Node 18.

## Architecture

```
src/
  extension.ts             # activate(), registers all commands, owns rawServers/allServers state
  types.ts                 # Server, GroupBy, GROUPABLE_FIELDS, ExcludeRule, mapRecord()
  serverLoader.ts           # File picker dialog + fs.readFile + Linux filter
  projectManager.ts         # ProjectManager: CRUD + persistence for projects
  projectsTreeProvider.ts   # TreeDataProvider listing all projects (click to switch)
  serversViewProvider.ts    # WebviewView: project header + search box + grouped server list
  projectDetailsPanel.ts    # WebviewPanel: edit name/JSON path/groupBy/exclude rules/credentials
  sshManager.ts             # Builds ssh command, opens terminal, writes clipboard
media/codicons/            # Bundled @vscode/codicons font+css, loaded into the Servers webview
```

State lives in `extension.ts`: `rawServers` (everything loaded from the active project's JSON)
and `allServers` (derived from `rawServers` after applying the active project's exclude rules —
recomputed on every `refreshViews()` call). `ProjectManager` is the source of truth for project
metadata (`context.globalState`) and passwords (`context.secrets`, OS keychain).

## Projects

Each `Project` (see `projectManager.ts`) has: `id`, `name`, `jsonFilePath`, `credentials`
(`username`, `sshKeyPath`), `groupBy` (per-project override), and `excludeRules`
(`{ field, value }[]`, hides servers with an exact case-insensitive match on any rule). Only one
project is "active" at a time; switching projects reloads its JSON file and re-renders both
webviews. Passwords are never written to `globalState` — only `secrets.store()`/`secrets.get()`.

Editing a project opens `projectDetailsPanel.ts` as a full editor-tab `WebviewPanel` (not a
sidebar view), with Browse buttons for the JSON file and SSH key, and a datalist-assisted value
picker for exclude rules built from the distinct values found in that project's currently loaded
JSON.

## Input JSON format

Array of server objects exported from Excel MAL files. Key fields used (see `mapRecord()` in
`types.ts`):

| JSON key | Maps to |
|---|---|
| `Host name` | `Server.hostname` — row label, SSH target |
| `Private IP` | `Server.privateIp` — SSH target IP |
| `FQDN` | `Server.fqdn` — shown in tooltip |
| `Class` | `Server.serverClass` — used to filter out Windows/Appliances |
| `Server Status` | `Server.status` — shown in tooltip with a plain-language meaning |
| `Company` / `SBU` | `Server.company` / `Server.sbu` — groupable/filterable fields |
| `General Role` | `Server.generalRole` — Production vs Non-Production |
| `Application` | `Server.application` — search + groupable/filterable field |
| `Instance ID` | `Server.instanceId` — shown in tooltip |

Linux detection in `serverLoader.ts`: excludes entries whose `Class` or `OS/DB Version` contains
"windows". Accepts anything containing "linux", "suse", "rhel", "ubuntu", "debian", "centos",
"amazon", or "server".

`GROUPABLE_FIELDS` in `types.ts` lists every field usable for both grouping (the Servers webview's
folder hierarchy) and exclude filters (the project details panel).

## Commands

| Command ID | Trigger | Description |
|---|---|---|
| `sshFleetManager.loadFile` | Servers/Projects toolbar | File picker → parse → set as active project's JSON |
| `sshFleetManager.refresh` | Servers toolbar | Reload the active project's JSON file |
| `sshFleetManager.createProject` | Projects toolbar | Prompt for a name, create + activate a project |
| `sshFleetManager.switchToProject` | click a project row | Activate that project, reload its JSON |
| `sshFleetManager.switchProject` | command palette | QuickPick project switcher |
| `sshFleetManager.loadFileForProject` | right-click a project | Activate then load JSON for it |
| `sshFleetManager.editProjectCredentials` | gear icon / right-click a project | Opens `projectDetailsPanel.ts` |
| `sshFleetManager.deleteProject` | right-click a project | Confirm, delete project + stored password |

The Servers webview itself sends `openSsh`/`copyCommand` messages (with the clicked server's full
data) straight to `extension.ts` — there's no per-row VS Code command, since rows live inside a
custom webview, not a native `TreeView`.

## Settings

| Key | Default | Description |
|---|---|---|
| `sshFleetManager.defaultUser` | `ec2-user` | SSH username (project credentials override this) |
| `sshFleetManager.sshKeyPath` | `""` | Path to private key (`-i` flag); empty = omit (project override) |
| `sshFleetManager.groupBy` | `company` | Default grouping category; a project's own `groupBy` wins if set |

## SSH command format

```
ssh [-i "<keyPath>"] <user>@<privateIp>
```

Built in `sshManager.ts:buildCommand()`. `user`/`keyPath` resolve from the active project's
credentials first, falling back to the global settings above. If the project has a stored
password, opening an SSH terminal also copies it to the clipboard with a notification (never
included in the copy-command text). All MAL IPs are private (10.x.x.x) — user must be on VPN or
have a bastion configured separately.
