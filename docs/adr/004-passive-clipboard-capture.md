# ADR-004 — Clipboard capture is passive and polled

**Status:** accepted · **Date:** 2026-07-20

## Context

The target flow is "copy an item in game, see it analysed in the app". Two ways
to get there:

1. **Active** — a global hotkey (F8) injects Ctrl+C into the game, then the app
   reads the clipboard. Needs a native input library (nut.js).
2. **Passive** — the app watches the clipboard and reacts when the user copies
   something themselves.

Neither Windows nor Electron exposes a clipboard-change event without
registering a native listener.

## Decision

Ship the passive watcher first, polling `clipboard.readText()` every 250 ms.

Emission is gated twice: the text must have **changed**, and it must pass
`looksLikeItem()` — a single regex over the first lines. Text that fails the
gate never leaves the main process.

## Consequences

- No native dependency, no input injection, nothing that could be read as
  automation: the app only reads a clipboard the user filled themselves.
- The hotkey (stage 4) becomes purely additive. F8 will *trigger* Ctrl+C; this
  watcher stays the component that receives the result, so the pipeline below it
  does not change.
- A parse failure during background capture is dropped silently. The user did
  not ask for a result, so interrupting them with an error would be noise; the
  manual flow still reports failures because there the request was explicit.
- The clipboard's content at launch is adopted as the baseline rather than
  imported — whatever was copied before the app started is not an import
  request.
- 250 ms polling is imperceptible next to the ~50 ms layer-0 budget and costs a
  few microseconds per tick.

## Privacy

The watcher reads the clipboard continuously, which deserves to be visible
rather than hidden in Settings — hence the always-present Auto-capture switch in
the Analyzer header. Non-item text is discarded in main, is never sent over IPC,
never persisted and never leaves the machine.
