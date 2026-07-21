/**
 * Provider catalogue.
 *
 * Every entry except Anthropic speaks the OpenAI-compatible `/chat/completions`
 * shape, so they share one adapter and differ only by the rows below. Adding a
 * provider that speaks that dialect is a table entry — no new code, no new
 * dependency.
 *
 * Free-tier notes are what the provider advertised at the time of writing and
 * are shown in the UI as guidance, not as a promise. Limits change; treat them
 * as "where to look", not as a contract.
 *
 * Model ids drift faster than anything else here, so every one of these is a
 * default the user can overwrite in Settings.
 */
export interface ProviderPreset {
  readonly id: string;
  readonly label: string;
  /** OpenAI-compatible base URL. Null for providers with a bespoke adapter. */
  readonly baseUrl: string | null;
  readonly defaultModel: string;
  /** Where to obtain a key. Empty for local runtimes. */
  readonly keyUrl: string;
  /** Whether an API key is required at all. */
  readonly requiresKey: boolean;
  /**
   * Whether the endpoint accepts `response_format: {type:'json_object'}`.
   *
   * "OpenAI-compatible" is a family resemblance, not a specification. Gemini's
   * compatibility layer does not document this field, and sending unsupported
   * fields is rejected rather than ignored — so it is opt-in per provider and
   * the JSON shape is always also requested in the prompt.
   */
  readonly supportsJsonMode: boolean;
  /** One line shown under the provider in Settings. */
  readonly note: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    requiresKey: true,
    // Gemini's compatibility layer does not document `response_format`, and it
    // rejects the request rather than ignoring the field.
    supportsJsonMode: false,
    note: 'Generous free tier, no card required. The usual first choice.',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    requiresKey: true,
    supportsJsonMode: true,
    note: 'Free tier, no card. Extremely fast responses.',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-3.3-70b',
    keyUrl: 'https://cloud.cerebras.ai',
    requiresKey: true,
    supportsJsonMode: true,
    note: 'Free daily token allowance, no card. The fastest of the free tiers.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    requiresKey: true,
    supportsJsonMode: true,
    note: 'Free experiment tier for prototyping.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    keyUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
    supportsJsonMode: true,
    note: 'One key, many models. Any model id ending in ":free" costs nothing.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    keyUrl: 'https://ollama.com',
    requiresKey: false,
    supportsJsonMode: true,
    note: 'Runs on your machine. No key, no cost, and nothing leaves the PC.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    keyUrl: 'https://lmstudio.ai',
    requiresKey: false,
    supportsJsonMode: true,
    note: 'Local server. Start it in LM Studio, then pick the loaded model.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
    supportsJsonMode: true,
    note: 'Paid. No free tier.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: null, // uses the official SDK, not the OpenAI-compatible shape
    defaultModel: 'claude-opus-4-8',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    requiresKey: true,
    supportsJsonMode: true,
    note: 'Paid. Best quality for crafting analysis in testing.',
  },
];

export const presetFor = (id: string): ProviderPreset | undefined =>
  PROVIDER_PRESETS.find((preset) => preset.id === id);
