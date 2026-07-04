/**
 * Streaming shortcuts are inverted from pi's native defaults via keybindings.json:
 * - Enter (app.message.followUp) holds the message until the current run finishes;
 *   when idle it just sends normally.
 * - Option+Enter (tui.input.submit) steers into the running stream now.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (_pi: ExtensionAPI) {
	// ponytail: no hook; native keybindings already do exactly this.
}
