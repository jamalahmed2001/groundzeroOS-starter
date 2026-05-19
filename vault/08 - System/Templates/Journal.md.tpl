---
type: journal
project: <PROJECT_ID>
pipeline: <pipeline-name>
up: "[[<PROJECT> - Overview]]"
created: <ISO>
updated: <ISO>
---

# <PROJECT> - <Journal Name>

> One row per pipeline invocation. Append-only. Compacts per PRINCIPLES §13 when soft cap is hit (verbose rows roll into quarterly digests preserving every field).

| timestamp | invocation_id | outcome | <pipeline-specific columns> | notes |
|-----------|---------------|---------|-----------------------------|-------|
