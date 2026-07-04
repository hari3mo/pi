/**
 * Model Awareness Extension
 *
 * Keeps the LLM informed of the currently selected model:
 *   1. before_agent_start — appends the live active model (from ctx.model) to the
 *      system prompt on every user prompt, so it is always fresh.
 *   2. model_select — injects a session message when the model changes mid-session
 *      (e.g. shift+tab via model-cycle.ts), so context stays accurate even between
 *      prompts.
 *
 * Rationale: the Delegation Gate in ~/.pi/agent/AGENTS.md depends on the agent
 * knowing which model it currently runs as. The LLM has no innate knowledge of
 * this — without injection, switching models mid-session leaves the agent
 * believing it is still the previous model, and orchestration never triggers.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function describeModel(model: { provider?: string; id?: string; name?: string } | undefined): string {
	if (!model) return "unknown";
	return `${model.provider ?? "?"}/${model.id ?? model.name ?? "?"}`;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		const desc = describeModel(ctx.model);
		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Active model (authoritative, refreshed every prompt)\n\n` +
				`The currently selected model for this session is: ${desc}. ` +
				`This overrides any earlier statement about which model is active — the user can switch models mid-session (shift+tab). ` +
				`Evaluate delegation/orchestration rules (e.g. the Delegation Gate) against THIS value, not against what was true earlier in the conversation.`,
		};
	});

	pi.on("model_select", async (event, _ctx) => {
		// Session restore isn't a user-initiated switch; skip it.
		if (event.source === "restore") return;

		const prev = event.previousModel ? describeModel(event.previousModel) : "none";
		const next = describeModel(event.model);
		if (prev === next) return;

		pi.sendMessage(
			{
				customType: "model-awareness",
				content: `[model switch] Active model changed: ${prev} -> ${next}. Re-evaluate delegation/orchestration rules (Delegation Gate) against the new model.`,
				display: false,
			},
			{ triggerTurn: false },
		);
	});
}
