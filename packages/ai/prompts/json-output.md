## Output format

Reply with a single JSON object and nothing else. No prose before or after it,
no markdown code fences, no explanation of the JSON.

The object must have exactly these five keys:

```json
{
  "summary": "string",
  "craftRecommendation": "string",
  "steps": ["string"],
  "possibleUpgrades": ["string"],
  "nextBestAction": "string"
}
```

`steps` and `possibleUpgrades` are arrays of strings and may be empty. Every
other value is a plain string. Do not add keys, and do not nest the object
inside another one.
