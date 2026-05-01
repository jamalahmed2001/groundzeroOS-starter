---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: hyperv
source_skill_path: ~/clawd/skills/hyperv/src/cli.ts
updated: 2026-04-28
up: Agent Skills Hub
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# hyperv

> SSH-based Hyper-V manager for the PYT on-prem server (192.168.1.100). Lists, starts, stops, restarts, snapshots, and inspects VMs. Can also create new VMs and SSH into running Linux VMs via ProxyJump.

## When a directive should call this

- A phase needs a clean isolated environment (staging VM, test DB, build runner)
- A VM that hosts project infrastructure needs to be started before the phase runs
- Creating a new VM for a new project's hosting or CI needs
- Taking a pre-deploy snapshot as a rollback point
- SSHing into a running VM to run commands, deploy code, or check service state

## When NOT to call this

- The VM already has its own skill or SSH alias — use that directly
- Cloud VM management (AWS EC2, GCP Compute) — use the respective cloud CLI

## How to call it

```bash
# List all VMs and their state
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts list

# Start / stop / restart
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts start "Ubuntu Server"
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts stop  "Ubuntu Server"
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts restart "Ubuntu Server"

# Snapshot before a risky change
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts snapshot "Ubuntu Server" "pre-deploy-2026-04-28"

# Detailed VM info (RAM, disk path, MAC, uptime)
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts info "Ubuntu Server"

# SSH into a running VM (requires VM to report IP via Hyper-V integration services)
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts ssh "Ubuntu Server"
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts ssh "Ubuntu Server" -- "sudo systemctl status nginx"

# Run arbitrary PowerShell on the Hyper-V host
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts host "Get-VMSwitch | Select-Object Name,SwitchType"
```

## Creating a new VM (manual PowerShell via host verb)

Full VM creation is done via `host` verb with a PowerShell one-liner. See [[PYT Hyper-V Server]] for the full provisioning workflow.

```bash
# Example: create a 2 vCPU / 4 GB RAM / 40 GB disk VM named "my-vm"
~/.bun/bin/bun ~/clawd/skills/hyperv/src/cli.ts host \
  "New-VHD -Path 'C:\\ProgramData\\Microsoft\\Windows\\Virtual Hard Disks\\my-vm.vhdx' -SizeBytes 40GB -Dynamic; \
   \$vm = New-VM -Name 'my-vm' -MemoryStartupBytes 4GB -VHDPath 'C:\\...\\my-vm.vhdx' -Generation 1 \
         -SwitchName 'Intel(R) Gigabit 4P I350-t rNDC - Virtual Switch'; \
   Set-VM -VM \$vm -ProcessorCount 2; \
   Start-VM \$vm"
```

## Host details

| Property | Value |
|---|---|
| Hostname | PYT |
| IP | 192.168.1.100 |
| SSH alias | `hyperv` |
| OS | Windows Server 2012 R2 |
| CPU | 2× Xeon E5-2620 v2 (24 threads) |
| RAM | 32 GB |
| Disk free | ~168 GB |
| Virtual switch | External (VMs get real LAN IPs) |

## Known VMs

| VM | State | Notes |
|---|---|---|
| Ubuntu Server | Running | Hosts mailcow (email stack) |
| linux | Off | General Linux VM |
| crm server | Off | CRM instance |
| PYO CRM | Off | CRM instance |
| PYT CRM | Off | CRM instance |
| Taurus CRM | Off | CRM instance |

## Notes

- **No IP reporting on Ubuntu Server:** Hyper-V integration services not installed in the guest — IP must be set manually in `~/.ssh/config` as a ProxyJump entry.
- **Auth:** ed25519 key at `~/.ssh/id_ed25519_hyperv`. The Windows host uses `administrators_authorized_keys` with strict SYSTEM+Administrators-only ACL.
- **Shell:** Default SSH shell is PowerShell 5.1 (not cmd). Use PowerShell syntax in `host` commands. `&&` is invalid — chain with `;` instead.
