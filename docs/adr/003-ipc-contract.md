# ADR-003 — One validated contract for all IPC

**Status:** accepted · **Date:** 2026-07-20

## Context

Electron IPC is stringly-typed by nature: `ipcRenderer.invoke('some:channel', x)`
compiles no matter what main expects. In a three-process app (main, preload,
renderer) that drift is the single most common source of runtime bugs, and the
preload is also the security boundary — anything exposed there is reachable by
any script the renderer loads.

## Decision

`apps/desktop/src/shared/ipc.ts` declares every channel with a zod schema for
its request and its response. All three processes derive their types from it.

- **Main** validates the request before dispatch and converts `AppError` into a
  `SerializableError` (dropping `cause`, which is not structured-cloneable).
- **Preload** exposes only `invoke`, gated by a channel whitelist. `ipcRenderer`
  never reaches the renderer.
- **Renderer** validates the response, so a stale bundle talking to a newer main
  process fails at the boundary instead of corrupting component state.

The whitelist lives in a separate dependency-free module
(`shared/channels.ts`) and the contract is declared
`satisfies Record<IpcChannel, …>`. Importing the zod contract into the preload
pulled ~150 kB into the most privileged bundle in the app; the split brought it
to 0.6 kB while a compile error still catches a channel added in only one place.

## Consequences

- Adding a channel is one entry in `channels.ts` and one in `ipcContract`;
  forgetting either does not compile.
- Handlers stay trivial adapters — logic lives in packages, testable without
  Electron.
- Validation costs a few hundred microseconds per call, which is irrelevant next
  to the 50 ms layer-0 budget.

## Note on the clipboard

`clipboard:parse` reads *and* parses in main. The renderer never receives raw
clipboard text — it may contain passwords or unrelated copied data, and there is
no reason for the least-trusted process to see it.
