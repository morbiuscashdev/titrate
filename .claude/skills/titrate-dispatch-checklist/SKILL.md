---
name: titrate-dispatch-checklist
description: Use before dispatching any implementation subagent in the Titrate monorepo to work through a plan task. Ensures the subagent gets the context it needs (API cheat sheets, envelope schema, runtime quirks), that the environment is ready (dist freshness, Anvil if needed), and that the verification loop runs after (smoke test, type check, commit). Prevents the ~10-minute-per-dispatch API-rediscovery loop that burned cycles during Phase 1. Invoke when planning a subagent dispatch, when the user says "dispatch task N" or "implement task N", or as part of a sub-skill of superpowers:subagent-driven-development.
---

# Titrate Subagent Dispatch Checklist

A pre-flight / post-flight protocol for dispatching implementation subagents in this repo. The core finding from Phase 1 (31 tasks, 34 commits): the subagents are fine — the cycle cost came from **them rediscovering facts the dispatcher already knew**. This checklist front-loads that knowledge.

## Pre-flight (before writing the dispatch prompt)

### 1. Identify the task's surface

Determine which of these the task touches, then include the matching context:

- **TUI / OpenTUI** → include `titrate-subagent-context` sections `OpenTUI API quirks` + `bun:test API differences` + `TUI runtime`
- **SDK types** → include `SDK workspace` + `WalletRecord envelope schema` if touching signers or wallets
- **storage-campaign** → include `Storage-campaign package` + note about `ensureDir()`
- **`--campaign` flag on commands** → include `loadFromCampaign decrypt flow`

Copy the relevant blocks from `titrate-subagent-context` skill directly into the dispatch prompt. Don't assume the subagent will invoke the skill itself — it won't.

### 2. Rebuild upstream dist if types are new

If the task's upstream dependency (usually SDK) had a type change in a prior task:

```bash
cd packages/sdk && npx tsc
```

See `titrate-dist-fresh` for dependency order. Without this, the subagent will hit "no exported member" errors and waste time diagnosing.

### 3. Start Anvil if the task involves integration tests

Tasks touching SDK integration tests, TUI full-campaign e2e, or disperse/scanner code benefit from a running Anvil. See `titrate-dev-services`.

### 4. Choose the model

| Task shape | Model |
|---|---|
| Pure additions, single file, plan gives complete code | haiku |
| Multiple files, API integration, potential API discovery | sonnet |
| Architectural judgment, refactor across packages | opus (main thread) or sonnet with careful briefing |

Phase 1 experience: SDK type tasks (1-5) → haiku clean. TUI screens with OpenTUI integration (15, 18, 20) → sonnet needed to discover API shapes. Pure fixes (28) → sonnet to trace the blast radius.

## Dispatch-prompt template

```
You are implementing Task N: **<name>** from `docs/superpowers/plans/<plan>.md`.

## Working Directory
/Users/michaelmclaughlin/Documents/morbius/github/titrate

Branch: <current branch>. Do not switch branches.

## Prerequisites completed
- Task <N-1>, <N-2>, ... complete. Their outputs visible in the SDK/storage/etc.

## Context you'll need (from titrate-subagent-context)

<paste relevant sections verbatim here>

## Task Description

<paste the full task text from the plan — don't make the subagent read the plan file>

## Verification before reporting back

1. Run tests: `<specific command>`
2. Type-check: `<specific command>`
3. (If TUI change) Run `titrate-tui-smoke` boot check
4. Commit with the exact message the plan specifies

## Report Format

- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Test output (exact)
- Files changed
- Commit SHA
- Any surprising API differences you had to resolve
```

## Post-flight (after the subagent reports DONE)

### 1. Trust but verify

Per superpowers:subagent-driven-development's guidance: the subagent's report describes intent, not necessarily reality. Quickly confirm:

```bash
git log --oneline -1       # Was the commit actually made?
git diff HEAD~1 --stat     # Did the expected files change?
<test command>             # Do the tests still pass?
```

### 2. Interpret new diagnostics correctly

If the `<new-diagnostics>` system reminder fires with "Cannot find module '../foo.js'" errors:

- If `ls <file>` shows the file exists AND `tsc --noEmit` is clean → **stale LSP**, ignore
- If `tsc --noEmit` also errors → **real problem**, investigate before marking the task complete

This was the single most common false alarm in Phase 1. Don't waste a fix-up dispatch on stale LSP.

### 3. Update TaskList

Mark the task `completed` via `TaskUpdate` and the next task `in_progress` before dispatching the next subagent.

### 4. Push periodically

Every 3-5 commits, push the branch so progress is visible on GitHub and the work is safe from local loss.

## Red flags — stop and reassess

- Subagent asks the same question twice across dispatches → the context briefing is missing something; update `titrate-subagent-context`
- Same API mismatch rediscovered by different subagents → front-load it in the next dispatch
- Subagent BLOCKED: with a library-API question → load the library's `.d.ts` from `node_modules/` into the next dispatch prompt
- Subagent reports "duplicated across files, should extract" → note as a follow-up cleanup task, don't let the subagent expand scope

## Companion skills

- `titrate-subagent-context` — the context blocks to paste
- `titrate-dist-fresh` — pre-dispatch dist rebuild
- `titrate-dev-services` — optional Anvil/TrueBlocks setup
- `titrate-tui-smoke` — post-dispatch boot-path verification
- `titrate-mock-client` — when tests need a viem client mock
