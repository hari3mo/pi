/**
 * Preserve pi's native streaming shortcuts:
 * - Enter sends/steers immediately.
 * - Option+Enter queues a follow-up.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (_pi: ExtensionAPI) {
	// ponytail: no hook; native keybindings already do exactly this.
}
