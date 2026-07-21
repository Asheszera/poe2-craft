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
| `packages/rules` | Deterministic craft advisor: facts, scoring, rules |
| `packages/ai` | The natural-language layer. Providers behind one port; prompts in `.md` |

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
- [ADR-004](docs/adr/004-passive-clipboard-capture.md) — clipboard capture is
  passive and polled
- [ADR-005](docs/adr/005-knowledge-base-sources.md) — every fact comes from a
  citable source
- [ADR-006](docs/adr/006-rules-in-typescript.md) — craft rules are code, not data
- [ADR-007](docs/adr/007-ai-narrates-never-decides.md) — the AI narrates, it
  never decides
- [ADR-008](docs/adr/008-credential-storage.md) — credentials live in the OS
  keychain
- [ADR-009](docs/adr/009-hotkey-sends-a-keystroke.md) — the hotkey sends a
  keystroke, and PowerShell sends it

## Roadmap status

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Workspace, models, parser | done |
| 2 | Electron shell, typed IPC, Item Analyzer, Dashboard | done |
| 3 | Knowledge base, tier inference, rules engine, AI providers, SQLite history | done |
| 4 | Global hotkey, overlay, price adapters, Build Advisor | done |
