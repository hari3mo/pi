---
title: Add a Model or Provider (models.json)
category: workflows
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
tags: [pi, providers, workflow]
aliases: [add a model, models.json how-to, ollama, local models]
summary: Add providers/models that speak a supported API (OpenAI/Anthropic/Google) by editing ~/.pi/agent/models.json — minimal local models need only an id; the file reloads each time you open /model.
relationships:
  - target: "[[components/providers-and-models]]"
    type: derived_from
  - target: "[[workflows/add-custom-provider]]"
    type: related_to
base_confidence: 0.85
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Add a Model or Provider (models.json)

Use `~/.pi/agent/models.json` when your provider speaks a supported API type
(`openai-completions`, `openai-responses`, `anthropic-messages`,
`google-generative-ai`). For **custom APIs or OAuth**, use an extension instead —
[[workflows/add-custom-provider]]. Reference: [[components/providers-and-models]].

## Local model (Ollama / LM Studio / vLLM)

Only `id` is required per model:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [ { "id": "llama3.1:8b" }, { "id": "qwen2.5-coder:7b" } ]
    }
  }
}
```

The `apiKey` is a placeholder (Ollama ignores it), but pi still treats models as needing
auth before they show in `/model` — keep a dummy value, save a key via `/login`, or pass
`--api-key`. If the server rejects the `developer` role or `reasoning_effort`, set
`compat.supportsDeveloperRole` / `supportsReasoningEffort` to `false` (provider- or
model-level).

## Fuller model entry

```json
{ "id": "llama3.1:8b", "name": "Llama 3.1 8B (Local)", "reasoning": false,
  "input": ["text"], "contextWindow": 128000, "maxTokens": 32000,
  "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 } }
```

Thinking controls: `thinkingLevelMap` maps pi levels (`off`…`xhigh`) to provider values,
`null` to hide an unsupported level.

## Point a built-in provider at a proxy

```json
{ "providers": { "anthropic": { "baseUrl": "https://my-proxy.example.com/v1" } } }
```

All built-in models remain; existing OAuth/API-key auth keeps working. Add a `models`
array to merge/upsert custom models by `id`, or use `modelOverrides` to tweak specific
built-in models (name, cost, compat, routing) without replacing the list.

## Apply

The file **reloads every time you open `/model`** — edit mid-session, no restart. Then
select the model with `/model`, `--model provider/id`, or add it to `enabledModels` for
Ctrl+P cycling.

## See also

- Full field/compat reference and auth: [[components/providers-and-models]]
- Custom streaming / OAuth providers: [[workflows/add-custom-provider]]
