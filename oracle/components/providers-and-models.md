---
title: Providers & Models
category: components
source_layer: upstream
pi_version: 0.80.3
sources:
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md
  - /Users/harissaif/.local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
tags: [pi, providers, component]
aliases: [providers, models, auth.json, models.json, model registry]
summary: Pi ships curated tool-capable model lists per built-in provider; auth is via /login (OAuth) or API keys in env/auth.json, and models.json adds/overrides providers and models for any supported API.
relationships:
  - target: "[[workflows/add-a-model]]"
    type: related_to
  - target: "[[workflows/add-custom-provider]]"
    type: related_to
  - target: "[[components/settings]]"
    type: related_to
base_confidence: 0.8
lifecycle: reviewed
lifecycle_changed: 2026-07-04
tier: supporting
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

# Providers & Models

For each built-in provider pi maintains a curated list of tool-capable models, refreshed
each release. Authenticate, then pick any model via `/model` (Ctrl+L) or CLI flags.

## Authentication

- **Subscriptions (OAuth via `/login`):** Anthropic Claude Pro/Max, OpenAI ChatGPT
  Plus/Pro (Codex), GitHub Copilot. Tokens live in `~/.pi/agent/auth.json`, auto-refresh.
- **API keys:** set an env var (e.g. `ANTHROPIC_API_KEY`) or store in `auth.json`
  (`{ "anthropic": { "type": "api_key", "key": "sk-..." } }`, created `0600`). ~30
  providers are recognized (DeepSeek, Gemini, Groq, xAI, OpenRouter, Vercel AI Gateway,
  Fireworks, Together, Mistral, Cerebras, Cloudflare, ZAI, Kimi, MiniMax, Xiaomi, …).
- **Cloud providers:** Azure OpenAI, Amazon Bedrock (AWS profile/IAM/bearer, ECS/IRSA),
  Google Vertex (ADC), Cloudflare AI Gateway / Workers AI — configured via env vars.

**Key resolution** supports shell commands (`"!op read ..."`, cached for process life),
env interpolation (`"$VAR"`, `"${A}_${B}"`), escapes (`"$$"`, `"$!"`), and literals.
`auth.json` can carry provider-scoped `env` values. **Credential resolution order:** CLI
`--api-key` → `auth.json` → env var → `models.json` provider keys.

## Selecting & cycling models

`/model` picks a model; `--model <pattern>` accepts `provider/id` and `:<thinking>`
(e.g. `--model sonnet:high`). `Ctrl+P`/`Shift+Ctrl+P` cycle "scoped models" configured
via `/scoped-models`, `--models`, or the `enabledModels` setting. The footer/status bar
always shows the model `id`.

## Adding & overriding via models.json

`~/.pi/agent/models.json` adds providers/models for any supported **API type**:
`openai-completions`, `openai-responses`, `anthropic-messages`,
`google-generative-ai`. The file **reloads every time you open `/model`** — no restart.

- **New provider:** give `baseUrl`, `api`, `models[]` (minimal model needs only `id`).
- **Override a built-in provider's endpoint:** just set `baseUrl` (all built-in models
  stay). Add `models[]` to merge/upsert custom models by `id`.
- **Per-model tweaks to built-ins:** `modelOverrides` (name, reasoning, input, cost,
  contextWindow, maxTokens, headers, compat) without replacing the model list.
- **Compatibility (`compat`):** provider- or model-level flags for OpenAI-compatible and
  Anthropic-compatible quirks (e.g. `supportsDeveloperRole`, `supportsReasoningEffort`,
  `thinkingFormat`, `openRouterRouting`, `forceAdaptiveThinking`).
- **Thinking levels:** `thinkingLevelMap` maps pi levels (`off`…`xhigh`) to provider
  values; `null` hides an unsupported level.

Model fields include `id` (only required), `name`, `api`, `reasoning`, `input`
(`["text"]` or `["text","image"]`), `contextWindow` (128000), `maxTokens` (16384), `cost`
(per-million), and `compat`.

## See also

- Step-by-step model addition: [[workflows/add-a-model]]
- Custom API/OAuth providers via extension: [[workflows/add-custom-provider]]
- `defaultProvider`/`defaultModel`/`enabledModels`: [[components/settings]]
</content>
