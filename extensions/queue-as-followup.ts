/**
 * Queue-as-followUp Extension
 *
 * By default, pi's interactive mode treats a message submitted (Enter) while the
 * agent is streaming as a "steer" — it is injected into the in-flight generation
 * immediately. This flips that default: an interactive submit made while the
 * agent is generating is queued as a "followUp" instead, so it is NOT delivered
 * until the current response has fully finished. Users can still queue as many
 * messages as they like mid-generation; they simply drain in order once the
 * agent is idle.
 *
 * Mechanism: the `input` event fires inside session.prompt() carrying the
 * streamingBehavior pi is about to use. Returning { action: "handled" } cancels
 * that default delivery; we then re-submit the same text via sendUserMessage
 * with deliverAs:"followUp". sendUserMessage uses source:"extension", so the
 * re-submit does not re-trigger this interactive-only interception.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event) => {
		// Only redirect the interactive Enter-while-streaming path. RPC/extension
		// callers pass their own explicit behavior; an idle submit (undefined) and
		// an already-followUp submit both pass through untouched.
		if (event.source !== "interactive" || event.streamingBehavior !== "steer") {
			return { action: "continue" };
		}

		const images = event.images;
		const content: string | (TextContent | ImageContent)[] =
			images && images.length > 0
				? [{ type: "text", text: event.text } as TextContent, ...images]
				: event.text;

		// Defer past the current prompt()/emitInput await rather than re-entering
		// prompt() from inside its own input handler. If the agent happens to finish
		// in this gap, deliverAs:"followUp" while idle just starts the next turn —
		// still "submit only after the previous response finished".
		// ponytail: sendUserMessage skips prompt-template/skill expansion, so a
		// queued "/template" won't expand. Fold expansion in here if that bites.
		setTimeout(() => pi.sendUserMessage(content, { deliverAs: "followUp" }), 0);

		return { action: "handled" };
	});
}
