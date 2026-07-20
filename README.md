# PoE2 AI Assistant

Desktop assistant for Path of Exile 2: paste or copy an item and get a
structured analysis — parsing, crafting advice, price estimate and an AI
summary. Analysis only; the app never reads or writes game memory and never
automates gameplay.

## Requirements

- Node.js ≥ 22
- pnpm 10

## Getting started

```bash
pnpm install
pnpm dev        # runs the Electron app
pnpm test       # vitest
pnpm typecheck
pnpm lint
```

> **pnpm 10 note:** dependency install scripts are blocked by default. The
> allowlist in `pnpm-workspace.yaml` (`onlyBuiltDependencies`) is what lets
> Electron download its binary. Without it the app builds and then fails to
> launch with `Error: Electron uninstall`.

## Layout

| Package | Responsibility |
| --- | --- |
| `apps/desktop` | Electron shell: main process, preload bridge, React renderer |
| `packages/shared` | Zero-dependency primitives: `Result`, `AppError`, text normalization |
| `packages/models` | zod schemas + inferred types — the shared vocabulary |
| `packages/parser` | Clipboard text → `ParsedItem`. Pure, synchronous, no I/O |
| `packages/data` | Bundled knowledge base + the enrichment pass that uses it |

Internal packages are **source-only**: their `exports` point at `src/index.ts`
and they are bundled by Vite/electron-vite. There is no per-package build step
to keep in sync.

## Architecture decisions

Every non-obvious choice is recorded in [`docs/adr`](docs/adr):

- [ADR-001](docs/adr/001-layered-analysis-pipeline.md) — the analysis pipeline
  is layered, not a single LLM call
- [ADR-002](docs/adr/002-affix-tiers-are-inferred.md) — affix tiers are
  inferred, and the model says so
- [ADR-003](docs/adr/003-ipc-contract.md) — one validated contract for all IPC

## Roadmap status

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Workspace, models, parser | done |
| 2 | Electron shell, typed IPC, Item Analyzer, Dashboard | done |
| 3 | Knowledge base, tier inference, rules engine, AI providers, SQLite history | next |
| 4 | Global hotkey, overlay, price adapters, Build Advisor | planned |
