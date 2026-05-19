---
type: pipeline
project: <PROJECT_ID>
name: <pipeline-name>
status: active
trigger: on-demand
schedule:
inputs: []
outputs:
  journal: refs/<PROJECT> - <Journal Name>.md
  artifacts: artifacts/<pipeline-name>/<iso>/
gates:
  promote_to:
  filter:
hitl: false
up: "[[<PROJECT> - Overview]]"
created: <ISO>
updated: <ISO>
---

# <PROJECT> - <Pipeline Name>

## Purpose
One paragraph.

## Stages
1. shell: <command>
2. skill: <skill-name> [args]
3. agent:
    brief: "What the agent should do, what to read, what to write"
    inputs: []
    output: <ref-or-artifact>
4. human: "criterion to tick"

## Verify (per invocation)
- shell: <verification-command>

## Failure policy
- On stage failure: write `outcome: failed` to journal, abort, do not promote.
- N consecutive failures: pipeline auto-pauses (status: paused); a phase opens for human review.
