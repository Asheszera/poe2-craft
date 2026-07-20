# ADR-008 — The API key never crosses the IPC boundary

**Status:** accepted · **Date:** 2026-07-20

## Context

The AI layer needs a provider credential. The obvious implementation — store it
in settings, return settings to the renderer, let the renderer send it with each
request — puts a long-lived secret into the least trusted process in the app and
onto every IPC message that carries settings.

## Decision

The key is stored **encrypted by the operating system** (`safeStorage`: DPAPI on
Windows, Keychain on macOS) and is readable only inside the main process.

The settings model is split at the type level:

- `AppSettings` — everything safe to hand to the renderer.
- `SettingsView` = `AppSettings` + `hasApiKey: boolean`. This is the *only*
  shape the `settings:get` channel can return, enforced by the IPC contract.
- `SettingsPatch` — accepts an optional `apiKey` **in**. Write-only by
  construction: there is no channel that returns it.

`ai:narrate` therefore takes the item's **raw text**, not a key and not an
analysis. Main re-derives the deterministic analysis (sub-millisecond) and calls
the provider itself.

## Why re-derive instead of accepting the analysis

Layer 0 costs under a millisecond, so passing the analysis back in saves nothing
measurable — and it would let the renderer dictate what the model is told to
"explain". Since the model's whole job is to narrate the analysis faithfully
(ADR-007), the analysis must come from the process that computed it.

## Consequences

- A leaked renderer — a compromised dependency, an XSS in some future
  web view — cannot exfiltrate the key, because it was never sent there.
- **If OS encryption is unavailable, saving the key fails loudly.** Writing
  plaintext to disk as a fallback would silently downgrade the guarantee the
  user thinks they have.
- A DPAPI blob does not survive being copied to another machine or user account.
  `apiKey()` returns null rather than throwing in that case, and the UI shows
  "not configured" — the same path as a first run.
- A corrupt settings file falls back to defaults instead of preventing startup,
  and unknown fields are filled from defaults field-by-field so a schema change
  between versions doesn't wipe the user's league or custom prompt.
