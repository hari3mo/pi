---
title: Add a Custom Provider (extension)
category: workflows
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/custom-provider.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
tags: [pi, providers, extensions, workflow]
aliases: [custom provider, registerProvider, OAuth provider, custom streaming]
summary: When a provider needs a custom API implementation or OAuth flow, register it from an extension via pi.registerProvider() — override an existing provider's baseUrl/headers, or add a new provider (use an async factory for remote model discovery).
relationships:
  - target: "[[components/extension-system]]"
    type: uses
  - target: "[[workflows/add-a-model]]"
    type: related_to
  - target: "[[components/providers-and-models]]"
    type: related_to
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Add a Custom Provider (extension)

Use an [[components/extension-system|extension]] with `pi.registerProvider()` when the
provider needs a **custom API implementation, OAuth/SSO, or custom streaming** — things
`models.json` can't express. For plain OpenAI/Anthropic/Google-compatible endpoints,
prefer [[workflows/add-a-model]] (no code).

## Override an existing provider

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerProvider("anthropic", { baseUrl: "https://proxy.example.com" });
  pi.registerProvider("openai", { headers: { "X-Custom-Header": "value" } });
}
```

With only `baseUrl`/`headers` (no `models`), all existing models are preserved with the
new endpoint.

## Register a new provider

```typescript
pi.registerProvider("my-provider", {
  name: "My Provider",
  baseUrl: "https://api.example.com",
  apiKey: "$MY_API_KEY",
  api: "openai-completions",
  models: [ { id: "my-model", name: "My Model", reasoning: false,
    input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000, maxTokens: 4096 } ],
});
```

## Remote model discovery (async factory)

```typescript
export default async function (pi: ExtensionAPI) {
  const res = await fetch("http://localhost:1234/v1/models");
  const payload = await res.json();
  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1", apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((m) => ({ id: m.id, name: m.name ?? m.id, reasoning: false,
      input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.context_window ?? 128000, maxTokens: m.max_tokens ?? 4096 })),
  });
}
```

pi awaits the factory before startup, so the provider is available during interactive
startup **and** to `pi --list-models`. (Fetch in the factory, not in `session_start`.)

The custom-provider doc also covers OAuth support, fully custom streaming APIs, context
overflow errors, `unregisterProvider`, and testing. Complete examples:
`custom-provider-anthropic/` (OAuth + custom streaming) and `custom-provider-gitlab-duo/`
(proxy via pi-ai's built-in streaming) — see [[references/examples-catalog]].

## See also

- The extension model this builds on: [[components/extension-system]]
- No-code provider/model config: [[workflows/add-a-model]] · [[components/providers-and-models]]
