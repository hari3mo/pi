/**
 * Task Tracker Extension - Demonstrates state management via session entries
 *
 * This extension:
 * - Registers a `task` tool for the LLM to manage tasks
 * - Registers a `/tasks` command for users to view the list
 *
 * State is stored in tool result details (not external files), which allows
 * proper branching - when you branch, the task state is automatically
 * correct for that point in history.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

interface Task {
	id: number;
	text: string;
	done: boolean;
}

interface TaskDetails {
	action: "list" | "add" | "toggle" | "clear";
	tasks: Task[];
	nextId: number;
	error?: string;
}

const TaskParams = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Task text (for add)" })),
	id: Type.Optional(Type.Number({ description: "Task ID (for toggle)" })),
});

/**
 * UI component for the /tasks command
 */
class TaskListComponent {
	private tasks: Task[];
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(tasks: Task[], theme: Theme, onClose: () => void) {
		this.tasks = tasks;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Tasks ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.tasks.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No tasks yet. Ask the agent to add some!")}`, width));
		} else {
			const done = this.tasks.filter((t) => t.done).length;
			const total = this.tasks.length;
			lines.push(truncateToWidth(`  ${th.fg("muted", `${done}/${total} completed`)}`, width));
			lines.push("");

			for (const task of this.tasks) {
				const check = task.done ? th.fg("success", "✓") : th.fg("dim", "○");
				const id = th.fg("accent", `#${task.id}`);
				const text = task.done ? th.fg("dim", task.text) : th.fg("text", task.text);
				lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export default function (pi: ExtensionAPI) {
	// In-memory state (reconstructed from session on load)
	let tasks: Task[] = [];
	let nextId = 1;

	/**
	 * Reconstruct state from session entries.
	 * Scans tool results for this tool and applies them in order.
	 */
	const reconstructState = (ctx: ExtensionContext) => {
		tasks = [];
		nextId = 1;

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "toolResult" || msg.toolName !== "task") continue;

			const details = msg.details as TaskDetails | undefined;
			if (details) {
				tasks = details.tasks;
				nextId = details.nextId;
			}
		}
	};

	// Reconstruct state on session events
	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	// Register the task tool for the LLM
	pi.registerTool({
		name: "task",
		label: "Task",
		description: "Track tasks for the current session. Actions: list, add (text), toggle (id), clear",
		parameters: TaskParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "list":
					return {
						content: [
							{
								type: "text",
								text: tasks.length
									? tasks.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n")
									: "No tasks",
							},
						],
						details: { action: "list", tasks: [...tasks], nextId } as TaskDetails,
					};

				case "add": {
					if (!params.text) {
						return {
							content: [{ type: "text", text: "Error: text required for add" }],
							details: { action: "add", tasks: [...tasks], nextId, error: "text required" } as TaskDetails,
						};
					}
					const newTask: Task = { id: nextId++, text: params.text, done: false };
					tasks.push(newTask);
					return {
						content: [{ type: "text", text: `Added task #${newTask.id}: ${newTask.text}` }],
						details: { action: "add", tasks: [...tasks], nextId } as TaskDetails,
					};
				}

				case "toggle": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text", text: "Error: id required for toggle" }],
							details: { action: "toggle", tasks: [...tasks], nextId, error: "id required" } as TaskDetails,
						};
					}
					const task = tasks.find((t) => t.id === params.id);
					if (!task) {
						return {
							content: [{ type: "text", text: `Task #${params.id} not found` }],
							details: {
								action: "toggle",
								tasks: [...tasks],
								nextId,
								error: `#${params.id} not found`,
							} as TaskDetails,
						};
					}
					task.done = !task.done;
					return {
						content: [{ type: "text", text: `Task #${task.id} ${task.done ? "completed" : "uncompleted"}` }],
						details: { action: "toggle", tasks: [...tasks], nextId } as TaskDetails,
					};
				}

				case "clear": {
					const count = tasks.length;
					tasks = [];
					nextId = 1;
					return {
						content: [{ type: "text", text: `Cleared ${count} tasks` }],
						details: { action: "clear", tasks: [], nextId: 1 } as TaskDetails,
					};
				}

				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						details: {
							action: "list",
							tasks: [...tasks],
							nextId,
							error: `unknown action: ${params.action}`,
						} as TaskDetails,
					};
			}
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("task ")) + theme.fg("muted", args.action);
			if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as TaskDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			const taskList = details.tasks;

			switch (details.action) {
				case "list": {
					if (taskList.length === 0) {
						return new Text(theme.fg("dim", "No tasks"), 0, 0);
					}
					let listText = theme.fg("muted", `${taskList.length} task(s):`);
					const display = expanded ? taskList : taskList.slice(0, 5);
					for (const t of display) {
						const check = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
						const itemText = t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text);
						listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
					}
					if (!expanded && taskList.length > 5) {
						listText += `\n${theme.fg("dim", `... ${taskList.length - 5} more`)}`;
					}
					return new Text(listText, 0, 0);
				}

				case "add": {
					const added = taskList[taskList.length - 1];
					return new Text(
						theme.fg("success", "✓ Added ") +
							theme.fg("accent", `#${added.id}`) +
							" " +
							theme.fg("muted", added.text),
						0,
						0,
					);
				}

				case "toggle": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
				}

				case "clear":
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all tasks"), 0, 0);
			}
		},
	});

	// Register the /tasks command for users
	pi.registerCommand("tasks", {
		description: "Show the task tracker for the current branch",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/tasks requires interactive mode", "error");
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TaskListComponent(tasks, theme, () => done());
			});
		},
	});
}
