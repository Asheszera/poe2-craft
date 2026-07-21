# ADR-009 — The hotkey sends a keystroke, and PowerShell sends it

**Status:** accepted · **Date:** 2026-07-21

## Context

ADR-004 shipped the passive clipboard watcher and left the F8 hotkey as the
additive half: the player hovers an item in game, presses F8, and the app makes
the copy happen instead of the player pressing Ctrl+C themselves.

Two questions had to be answered:

1. Does F8 open a *second* path into the app, or does it feed the existing one?
2. What synthesises the keystroke? The original brief named nut.js — a native
   module, so prebuilds for every Electron release and a compile toolchain for
   anyone building from source.

## Decision

**The hotkey adds a keystroke, not a capture path.** `HotkeyRegistry` presses
Ctrl+C and stops there; the clipboard watcher notices the change and runs
exactly the pipeline it already runs for a manual copy. There is one way an item
enters the app.

**PowerShell `SendKeys` sends it**, behind a `KeySender` port. Measured before
choosing: spawning `powershell -NoProfile -NonInteractive` and loading
`System.Windows.Forms` averaged **131 ms** over five runs on this machine. With
the watcher polling at 250 ms, F8-to-overlay lands under ~400 ms either way — a
native module would have bought roughly 100 ms of a budget that is dominated by
polling, in exchange for a compiled dependency.

Registration failure is **reported, not swallowed**. `globalShortcut.register`
returns false when another application already owns the key, and a hotkey that
silently does nothing is worse than no hotkey: `SettingsView` shows either
"Registered" or the reason it is not.

## Consequences

- No native dependency anywhere in the tree; `pnpm install` needs no toolchain.
- Windows only for now. `defaultKeySender` returns `UnsupportedKeySender`
  elsewhere, which rejects with a sentence explaining why rather than failing
  mysteriously.
- The port is the seam: if the latency ever matters, only `PowerShellKeySender`
  is replaced, and `HotkeyRegistry` and its tests do not move.
- Off by default. A global shortcut is a claim on a key across the whole desktop
  and the app should not take one uninvited.

## Boundary

This is the only place the app produces input, and it produces exactly one
keystroke, only while the shortcut the user configured is pressed. It does not
read the game's memory, does not inspect its process, and automates no part of
play — it presses the same key the player would have pressed.
