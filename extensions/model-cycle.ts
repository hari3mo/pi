/**
 * Model Cycle Extension
 *
 * Shift+Tab cycles through a fixed set of pinned models:
 * claude-sonnet-5 -> claude-opus-4-8 -> claude-fable-5 -> gemini-3.5-flash -> gemini-3.1-pro-preview -> gpt-5.5 -> gpt-5.5-pro -> (repeat)
 *
 * Note: Shift+Tab is freed up for this by rebinding the built-in
 * `app.thinking.cycle` action to Option+Tab in keybindings.json.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const MODEL_CYCLE: Array<{ provider: string; id: string }> = [
	{ provider: "anthropic", id: "claude-sonnet-5" },
	{ provider: "anthropic", id: "claude-opus-4-8" },
	{ provider: "anthropic", id: "claude-fable-5" },
	{ provider: "google", id: "gemini-3.5-flash" },
	{ provider: "google", id: "gemini-3.1-pro-preview" },
	{ provider: "openai", id: "gpt-5.5" },
	{ provider: "openai", id: "gpt-5.5-pro" },
];

export default function (pi: ExtensionAPI) {
	async function cycleModel(ctx: ExtensionContext) {
		const current = ctx.model;
		const currentIndex = MODEL_CYCLE.findIndex(
			(m) => current !== undefined && m.provider === current.provider && m.id === current.id,
		);
		const next = MODEL_CYCLE[(currentIndex + 1) % MODEL_CYCLE.length];

		const model = ctx.modelRegistry.find(next.provider, next.id);
		if (!model) {
			ctx.ui.notify(`Model not found: ${next.provider}/${next.id}`, "error");
			return;
		}

		const success = await pi.setModel(model);
		if (success) {
			ctx.ui.notify(`Model: ${model.name}`, "info");
		} else {
			ctx.ui.notify(`No API key configured for ${model.name}`, "error");
		}
	}

	pi.registerShortcut("shift+tab", {
		description: "Cycle model (sonnet-5 / opus-4-8 / fable-5 / gemini-3.5-flash / gemini-3.1-pro-preview / gpt-5.5 / gpt-5.5-pro)",
		handler: cycleModel,
	});
}
