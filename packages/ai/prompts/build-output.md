## Output format

Reply with a single JSON object and nothing else. No prose before or after it,
no markdown code fences, no explanation of the JSON.

The object must have exactly these six keys:

```json
{
  "score": 0,
  "verdict": "equip" | "craft" | "sell" | "vendor" | "unclear",
  "reasoning": "string",
  "whatWorks": ["string"],
  "whatIsMissing": ["string"],
  "assumptions": ["string"]
}
```

`score` is a number from 0 to 100. `verdict` must be exactly one of the five
words shown. The three arrays may be empty. Do not add keys, and do not nest the
object inside another one.
