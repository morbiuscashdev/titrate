---
name: titrate-tui-smoke
description: Use after any non-trivial change to `packages/tui/` — App shell, screens, commands, context providers, or OpenTUI integration. Also use proactively before claiming a TUI task is complete, especially after adding a new screen, modifying navigation, or changing how `<App>` mounts providers. This runs a full launch-and-exit of `titrate new` against a temp directory, verifies the campaign dir was written correctly, and catches boot-path regressions that unit tests and `captureCharFrame()` snapshots cannot.
---

# Titrate TUI Smoke

## Why

Snapshot tests via `captureCharFrame()` verify rendered output but render inside an in-memory test renderer — not a real pty, not a real Bun process, not the real Commander entry point. Bugs like:

- Module-load-time errors (circular imports, missing deps)
- Commander subcommand registration mistakes
- File-system permission issues on campaign-dir creation
- Bun-specific JSX runtime bugs
- Crashes during `createCliRenderer` before the first React commit

...all slip past unit tests and only surface when the real CLI entry point runs. This skill runs that actual path.

## The smoke check

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate/packages/tui

# Clean any leftover smoke dir
SMOKE_ROOT="/tmp/titrate-smoke-$$"
rm -rf "$SMOKE_ROOT"

# Spawn with a timeout — the TUI would block forever otherwise.
# 3 seconds is enough for the React shell to boot and write the initial manifest.
timeout 3 bun run src/index.tsx new smoke-$$ --folder "$SMOKE_ROOT" 2>&1 | tail -5 || true

# Verify the campaign directory was created with a manifest
ls "$SMOKE_ROOT"/ 2>&1
# Expected: a subdirectory like "smoke-<pid>-<hex>/"

# Verify the manifest was written correctly
find "$SMOKE_ROOT" -name campaign.json -exec cat {} \; | head -20
# Expected: JSON with id, name, chainId, status: "configuring", etc.

# Clean up
rm -rf "$SMOKE_ROOT"
```

## Interpreting the result

| Observation | Meaning |
|---|---|
| Campaign dir exists + `campaign.json` has valid JSON | ✅ App booted, providers mounted, storage wrote manifest |
| Campaign dir exists but `campaign.json` missing | Storage layer failed between `storage.ensureDir()` and `storage.manifest.write(...)` — look at new-campaign.tsx |
| Campaign dir doesn't exist | App crashed during module load or before the first await. Look at stderr from the `timeout` output |
| `timeout` exits 124 (normal SIGTERM) with dir created | Expected — we're killing a running TUI on purpose |
| `timeout` exits non-0 WITHOUT creating the dir | Error before bootup. Check stderr |
| Stdout shows unhandled-rejection trace | A promise rejected during mount — common cause: missing context provider, wrong OpenTUI prop shape |

## Also verify `titrate list`

```bash
SMOKE_ROOT="/tmp/titrate-smoke-list-$$"
rm -rf "$SMOKE_ROOT"
timeout 3 bun run src/index.tsx new listable-smoke --folder "$SMOKE_ROOT" || true

# List command should find the campaign without launching the TUI
bun run src/index.tsx list --folder "$SMOKE_ROOT"

# Expected: tab-separated row with id, name, status, updated timestamp
rm -rf "$SMOKE_ROOT"
```

## Also verify `titrate open` reopens what `new` created

```bash
SMOKE_ROOT="/tmp/titrate-smoke-open-$$"
rm -rf "$SMOKE_ROOT"
timeout 3 bun run src/index.tsx new reopen-me --folder "$SMOKE_ROOT" || true

# Extract the generated campaign id (it has a random suffix)
CAMPAIGN_ID=$(ls "$SMOKE_ROOT" | grep -v '^_' | head -1)

# Reopen
timeout 3 bun run src/index.tsx open "$CAMPAIGN_ID" --folder "$SMOKE_ROOT" || true
echo "Reopen exited with $?"
# Non-error exit code (124 from timeout is fine, 0 also fine, 1+ means open failed)

rm -rf "$SMOKE_ROOT"
```

## When to skip

- Your change is purely inside a single screen's render logic and you already have a `captureCharFrame` test that covers it
- You're only touching SDK / storage-campaign (no TUI code path changed)
- You're iterating quickly on test fixtures

Run the smoke check before calling a TUI-touching task DONE. It's cheap (~5 seconds) and catches the class of bug that otherwise only fails in someone else's hands.
