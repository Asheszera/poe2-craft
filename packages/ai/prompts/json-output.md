## Output format

Reply with a single JSON object and nothing else. No prose before or after it,
no markdown code fences, no explanation of the JSON.

The object must have exactly these four keys:

```json
{
  "summary": "string",
  "plans": [
    {
      "name": "string",
      "approach": "deterministic" | "gamble" | "hybrid",
      "steps": ["string"],
      "estimatedCost": "string",
      "stopWhen": "string",
      "abandonWhen": "string"
    }
  ],
  "possibleUpgrades": ["string"],
  "nextBestAction": "string"
}
```

`plans` and `possibleUpgrades` are arrays and may be empty. `approach` must be
exactly one of the three words shown. Every other value is a plain string — put
"unknown" in `estimatedCost` rather than omitting it. Do not add keys, and do
not nest the object inside another one.
