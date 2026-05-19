---
project: <PROJECT_ID>
status: active
priority: 3
repo_path: <REPO_ABS_PATH>
exchange: <kraken|binance|coinbase|...>
strategy_type: <trend|mean-rev|arb|...>
risk_limits:
  max_position_pct: <number>
  daily_loss_cap_pct: <number>
backtest_command: <command>
requires: []
up: "[[<PARENT_HUB>]]"
created: <ISO>
updated: <ISO>
tags: [kind-trading, status-active]
---

## 🔗 Navigation
**UP:** [[<PARENT_HUB>]]
**Children:**
- [[<PROJECT> - Status]]
- [[<PROJECT> - Knowledge]]
- [[<PROJECT> - Decisions]]

# <PROJECT_NAME>

## Safety
This project can place real orders against real money. The live-trade pipeline is HITL — promotions from paper-trade to live require explicit human approval per strategy via a Promotion Queue. No automation flows from post-mortem or backtest result into live-trade without that gate.

## Identity
One paragraph: what this trading system is and isn't.

## Goals
- Run <strategy_type> on <exchange> under declared risk_limits
- Self-learn via news ingest → strategy generation → backtest → paper → HITL → live

## Verify defaults
- shell: <backtest_command>
- skill: <exchange>-paper-trade-roundtrip
- human: "no risk limit breached this run"

## Roles
*(optional; consider `role: investment-analyst` from `08 - System/Roles/`)*

## Conventions
*(optional)*
