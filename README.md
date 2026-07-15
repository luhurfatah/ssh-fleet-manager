# SSH Fleet Manager

A VS Code extension for managing server fleets via SSH. Organizes servers into projects, each backed by a MAL (Master Asset List) JSON inventory file, with saved credentials, grouping, and exclude filters.

## Features

- **Projects** — Create multiple projects, each with its own server inventory, SSH credentials, and display settings. Switch between them instantly.
- **Server browser** — Sidebar webview with search and grouped server list. Servers fold into categories (Company, SBU, Application, etc.) for fast navigation.
- **One-click SSH** — Click any server to open an integrated terminal with the SSH command pre-filled. Password is copied to clipboard automatically when set.
- **Copy SSH command** — Grab the command without opening a terminal.
- **Exclude rules** — Hide servers by field value (e.g. hide all `Status: Decommissioned`) per project.
- **Credential management** — Per-project SSH username, key path, and password (stored in the OS keychain via VS Code Secrets API, never in plaintext).

## Requirements

- VS Code 1.85+
- SSH client available in your terminal (`ssh` on the `$PATH`)
- VPN or bastion access — all MAL IPs are private (`10.x.x.x`)

## Setup

### 1. Create a project

Open the **SSH Fleet Manager** panel in the activity bar → click **+** in the Projects section → enter a project name.

### 2. Load a server inventory

Click the folder icon in the Servers toolbar (or right-click the project → **Load JSON for This Project**) and select your MAL JSON file.

### 3. Configure credentials (optional)

Right-click a project → **Edit Project Details** to set:
- SSH username (falls back to the `sshFleetManager.defaultUser` setting)
- SSH key path (`-i` flag; falls back to `sshFleetManager.sshKeyPath`)
- Password (stored in OS keychain; copied to clipboard when opening SSH)
- Grouping category and exclude rules

## MAL JSON format

The inventory file must be a JSON array of server objects exported from a MAL spreadsheet:

```json
[
  {
    "Host name": "web-prod-01",
    "Private IP": "10.0.1.100",
    "FQDN": "web-prod-01.internal",
    "Class": "Linux",
    "Server Status": "In Service",
    "Company": "Acme",
    "SBU": "Platform",
    "General Role": "Production",
    "Application": "Web",
    "Instance ID": "i-0abc123"
  }
]
```

Windows and Appliance entries are filtered out automatically. Accepted OS keywords: `linux`, `suse`, `rhel`, `ubuntu`, `debian`, `centos`, `amazon`, `server`.

## Settings

| Setting | Default | Description |
|---|---|---|
| `sshFleetManager.defaultUser` | `ec2-user` | SSH username when no project credential is set |
| `sshFleetManager.sshKeyPath` | `""` | Path to SSH private key; empty = omit `-i` flag |
| `sshFleetManager.groupBy` | `company` | Default grouping field; per-project setting overrides this |

**Available grouping fields:** `status`, `company`, `sbu`, `generalRole`, `serverClass`, `application`, `accountName`, `owner`, `instanceType`, `osVersion`

## Development

```bash
npm install          # install dependencies (first time)
node esbuild.js      # build → dist/extension.js
npx tsc --noEmit     # type-check only
node esbuild.js --watch   # watch mode
```

Press **F5** to launch the Extension Development Host with the extension loaded.

## Packaging

```bash
npm run package      # produces ssh-fleet-manager-<version>.vsix
```

Install via Extensions panel → `...` → **Install from VSIX**, or:

```bash
code --install-extension ssh-fleet-manager-0.1.0.vsix
```
