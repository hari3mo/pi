<!-- Fragment: upstream-layer index bullets (pi_version 0.80.3). Merged into index.md ## Upstream by the integration pass. -->

### Concepts
- [[concepts/what-is-pi]] — Pi is a minimal terminal coding harness with a small four-tool core, extended via TypeScript instead of forking, running in four modes ( #pi #concept)
- [[concepts/extensibility-philosophy]] — Why the core is minimal: no MCP/sub-agents/plan-mode/permission-popups/to-dos/background-bash by design, built with extensions instead ( #pi #extensions #concept)
- [[concepts/message-queue]] — Steering (Enter, after current tool batch) vs follow-up (Alt+Enter, after all work) message queueing while the agent works ( #pi #tui #concept)
- [[concepts/session-model]] — Sessions are single JSONL trees: /tree branches in place, /fork and /clone spin off files, compaction summarizes old context losslessly ( #pi #concept)
- [[concepts/project-trust]] — Project trust is an input-loading guard (not a sandbox); pi runs with full user permissions so real isolation comes from containers ( #pi #config #concept)

### Components
- [[components/extension-system]] — ExtensionAPI: TypeScript factory registers tools/commands/shortcuts/providers and subscribes to a rich cancellable event lifecycle ( #pi #extensions #component)
- [[components/tools]] — Built-in read/write/edit/bash/grep/find/ls plus custom tools via pi.registerTool (typebox params, streaming, override, rendering) and CLI allowlisting ( #pi #extensions #component)
- [[components/skills-system]] — On-demand SKILL.md capability packages (Agent Skills standard) with progressive disclosure: descriptions in context, instructions load on match or /skill:name ( #pi #skills #component)
- [[components/prompt-templates]] — Markdown prompts expanded via /name with positional args ($1, $@, ${1:-default}) and argument-hint autocomplete ( #pi #prompts #component)
- [[components/themes]] — JSON theme files defining all 51 color tokens (plus vars/export); dark/light built-ins, custom themes hot-reload ( #pi #tui #component)
- [[components/keybindings]] — Namespaced action ids (tui.editor.*, app.*) customizable in keybindings.json, one-or-more keys each, /reload to apply ( #pi #tui #component)
- [[components/tui-components]] — pi-tui Component interface, built-ins (Text/Box/Container/Spacer/Markdown/Image), overlays, and Focusable IME cursor support for extension UI ( #pi #tui #extensions #component)
- [[components/providers-and-models]] — Curated per-provider model lists, /login OAuth or API-key auth, and models.json to add/override providers/models for supported APIs ( #pi #providers #component)
- [[components/pi-packages]] — Bundle extensions/skills/prompts/themes for npm/git/local sharing via package.json's pi manifest or convention dirs ( #pi #config #component)
- [[components/settings]] — JSON settings where project (.pi/settings.json) deep-merges over global (~/.pi/agent/settings.json) across model/UI/compaction/retry/delivery/resources ( #pi #config #component)

### Workflows
- [[workflows/write-an-extension]] — Create a default-export ExtensionAPI factory, drop in extensions/ (or pi -e), register tools/commands, subscribe to events, /reload ( #pi #extensions #workflow)
- [[workflows/create-a-skill]] — Make a SKILL.md dir with name + a specific description, add scripts/references, place in a skills location, invoke via /skill:name or auto-load ( #pi #skills #workflow)
- [[workflows/add-a-model]] — Add providers/models for supported APIs via ~/.pi/agent/models.json (local models need only an id); reloads each /model open ( #pi #providers #workflow)
- [[workflows/add-custom-provider]] — Register custom-API/OAuth/streaming providers from an extension via pi.registerProvider (async factory for remote model discovery) ( #pi #providers #extensions #workflow)
- [[workflows/embed-pi-with-sdk]] — Embed pi in Node with createAgentSession() (single session) or createAgentSessionRuntime() (session replacement); subscribe then prompt() ( #pi #sdk #workflow)
- [[workflows/create-a-pi-package]] — Add a pi manifest + pi-package keyword to package.json, list resources with globs, put pi cores in peerDependencies, share via npm/git ( #pi #config #workflow)

### References
- [[references/cli-reference]] — Distilled catalog of pi's CLI flags (modes/model/session/tool/resource), interactive slash commands, and environment variables ( #pi #config #reference)
- [[references/rpc-mode]] — pi --mode rpc: strict LF-delimited JSONL protocol (commands in, responses + streamed events out) for non-Node integrations ( #pi #sdk #reference)
- [[references/session-format]] — Versioned JSONL session trees (v3), entry types, buildSessionContext leaf→root walk, and the SessionManager API ( #pi #sdk #reference)
- [[references/examples-catalog]] — Map of the install's examples/ tree: 70+ themed extension examples plus a 13-step SDK ladder, with what each demonstrates ( #pi #extensions #reference)
</content>
