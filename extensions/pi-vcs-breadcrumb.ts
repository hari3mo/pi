import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";

// NOTE (deviation from the original plan, verified against docs/extensions.md
// and the shipped .d.ts types): `tool_execution_end` in this pi version has
// the shape { toolCallId, toolName, result, isError } — it does NOT carry the
// tool input/args, so `event.input` would always be undefined there. The
// closest event that carries the tool arguments (including `path` for
// edit/write) is `tool_execution_start`, which has { toolCallId, toolName,
// args }. Switched to that event and to `event.args` instead of
// `event.input` to preserve the intent (recording which file a pi tool
// touched) while matching the actual API surface.
export default function (pi: ExtensionAPI) {
  pi.on("tool_execution_start", async (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const rec = {
      ts: new Date().toISOString(),
      session: ctx.sessionManager.getSessionFile() ?? "ephemeral",
      tool: event.toolName,
      path: (event.args as any)?.path ?? null,
    };
    try {
      appendFileSync(`${homedir()}/Library/Logs/pi-agent-vcs-breadcrumbs.jsonl`, JSON.stringify(rec) + "\n");
    } catch {}
  });
}
