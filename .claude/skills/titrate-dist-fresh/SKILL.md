---
name: titrate-dist-fresh
description: Use when a downstream package's TypeScript reports "Module '@titrate/<pkg>' has no exported member 'X'" for a symbol you KNOW was just added to that workspace package, or when a test file imports a type from `@titrate/sdk` or `@titrate/storage-campaign` and TS claims the type doesn't exist. The cause is almost always stale `dist/index.d.ts` — workspace packages publish types from built artifacts, and the downstream consumer hasn't seen the rebuild. Run the dependency-ordered rebuild in this skill and re-check. Also use proactively after adding a type to the SDK before dispatching a subagent that will consume it.
---

# Titrate Dist Freshness

## The trap

The workspace has two layers of TypeScript resolution:

1. **vitest / bun test** resolve imports via source files — they see changes instantly.
2. **`tsc --noEmit` / LSP / downstream package compilation** resolve via each package's `types` field, which points at `dist/index.d.ts` — a **built artifact** that's only current after the source package runs `tsc`.

That mismatch causes this weird state: tests pass, but the LSP screams "Cannot find exported member" on the import line. The code is right; the `.d.ts` is stale.

## Dependency order (rebuild in this order)

```
packages/sdk
    ↓ (depended on by)
packages/storage-fs, packages/storage-idb, packages/storage-campaign
    ↓
packages/tui, packages/web
```

Always rebuild from upstream → downstream.

## One-shot rebuild

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate

# SDK first (everything depends on it)
(cd packages/sdk && npx tsc)

# Then storage packages
(cd packages/storage-fs && npx tsc)
(cd packages/storage-idb && npx tsc)
(cd packages/storage-campaign && npx tsc)

# Web (Node-side type check only)
(cd packages/web && npx tsc --noEmit)

# TUI (Bun)
(cd packages/tui && bunx tsc --noEmit)
```

If the SDK rebuild fails, stop — downstream will fail too. Fix the upstream error first.

## Verify the new type landed

```bash
# Grep the built .d.ts for the symbol you expect:
grep -c "YourNewType" packages/sdk/dist/index.d.ts
grep -c "YourNewType" packages/storage-campaign/dist/index.d.ts
```

Nonzero = the type is now visible to consumers.

## Permanent fix — types from source

If this rebuild dance gets old, change the workspace's `types` field to point at source:

```json
// packages/sdk/package.json
{
  "types": "src/index.ts"
}
```

Downsides:
- Published tarballs no longer ship a compiled `.d.ts` — consumers outside the workspace would need `.ts` support. Not relevant while packages are private-workspace-only.
- Some editor setups get confused by projects that import from a `.ts` file via a bare specifier. Usually fine with modern TypeScript.

Upsides:
- Zero rebuild step. Types are always current.
- Reduces "phantom missing export" errors to zero.

**Recommendation**: if/when these packages start publishing to a registry, switch back to `dist/`. Until then, `src/` is the ergonomic choice.

## Stale LSP vs stale dist

Distinguish:
- **Stale LSP**: shows errors for files that were just created — the language server hasn't re-indexed yet. Disappears after editor reload or `tsc --noEmit` from the terminal. No file change needed.
- **Stale dist**: `tsc --noEmit` itself fails with "no exported member". Requires the rebuild.

If `tsc --noEmit` is clean but the LSP still shows errors, it's the former — ignore until the LSP catches up or restart the editor.

## Fallback: tell the user

If you're unsure and don't want to burn cycles:

> "The LSP is flagging missing exports but `tsc --noEmit` is clean — likely stale language-server state. Refresh the TypeScript server in your editor (VS Code: Cmd+Shift+P → 'Restart TS Server')."
