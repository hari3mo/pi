/**
 * Task Tracker Extension - Demonstrates state management via session entries
 *
 * This extension:
 * - Registers a `task` tool for the LLM to manage tasks
 * - Keeps a persistent TUI widget/status in sync with the current branch
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

const WIDGET_ID = "task-tracker";

const cloneTasks = (items: readonly Task[]): Task[] => items.map(({ id, text, done }) => ({ id, text, done }));

/**
 * UI component for the /tasks command
 */
class TaskListComponent {
	private getTasks: () => Task[];
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(getTasks: () => Task[], theme: Theme, onClose: () => void) {
		this.getTasks = getTasks;
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

		const tasks = this.getTasks();
		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Tasks ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (tasks.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No tasks yet. Ask the agent to add some!")}`, width));
		} else {
			const done = tasks.filter((t) => t.done).length;
			const total = tasks.length;
			lines.push(truncateToWidth(`  ${th.fg("muted", `${done}/${total} completed`)}`, width));
			lines.push("");

			for (const task of tasks) {
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
	const activeViews = new Set<{ component: TaskListComponent; requestRender: () => void }>();

	const detailsFor = (action: TaskDetails["action"], error?: string): TaskDetails => ({
		action,
		tasks: cloneTasks(tasks),
		nextId,
		...(error ? { error } : {}),
	});

	const applyDetails = (details: TaskDetails) => {
		tasks = cloneTasks(details.tasks ?? []);
		nextId = Number.isFinite(details.nextId) && details.nextId > 0 ? Math.floor(details.nextId) : 1;
	};

	const renderWidget = (theme: Theme, width: number): string[] => {
		const done = tasks.filter((t) => t.done).length;
		const lines = [truncateToWidth(theme.fg("accent", theme.bold(`Tasks ${done}/${tasks.length}`)), width)];
		const shown = tasks.slice(0, 6);

		for (const task of shown) {
			const check = task.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
			const id = theme.fg("accent", `#${task.id}`);
			const text = task.done ? theme.fg("dim", task.text) : theme.fg("text", task.text);
			lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
		}

		if (tasks.length > shown.length) {
			lines.push(truncateToWidth(theme.fg("dim", `  ... ${tasks.length - shown.length} more`), width));
		}

		return lines;
	};

	const updateUi = (ctx: ExtensionContext) => {
		for (const view of activeViews) {
			view.component.invalidate();
			view.requestRender();
		}

		if (!ctx.hasUI) return;

		if (tasks.length === 0) {
			ctx.ui.setStatus(WIDGET_ID, undefined);
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		const done = tasks.filter((t) => t.done).length;
		ctx.ui.setStatus(WIDGET_ID, ctx.ui.theme.fg("accent", `tasks ${done}/${tasks.length}`));
		ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
			render: (width) => renderWidget(theme, width),
			invalidate: () => {},
		}));
	};

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
			if (details) applyDetails(details);
		}

		updateUi(ctx);
	};

	// Reconstruct state on session events
	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	// Register the task tool for the LLM
	pi.registerTool({
		name: "task",
		label: "Task",
		description: "Track tasks for the current branch. Actions: list, add (text), toggle (id), clear",
		parameters: TaskParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			switch (params.action) {
				case "list":
					updateUi(ctx);
					return {
						content: [
							{
								type: "text",
								text: tasks.length
									? tasks.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n")
									: "No tasks",
							},
						],
						details: detailsFor("list"),
					};

				case "add": {
					if (!params.text) {
						return {
							content: [{ type: "text", text: "Error: text required for add" }],
							details: detailsFor("add", "text required"),
						};
					}
					const newTask: Task = { id: nextId++, text: params.text, done: false };
					tasks = [...tasks, newTask];
					updateUi(ctx);
					return {
						content: [{ type: "text", text: `Added task #${newTask.id}: ${newTask.text}` }],
						details: detailsFor("add"),
					};
				}

				case "toggle": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text", text: "Error: id required for toggle" }],
							details: detailsFor("toggle", "id required"),
						};
					}
					const task = tasks.find((t) => t.id === params.id);
					if (!task) {
						return {
							content: [{ type: "text", text: `Task #${params.id} not found` }],
							details: detailsFor("toggle", `#${params.id} not found`),
						};
					}
					const done = !task.done;
					tasks = tasks.map((t) => (t.id === params.id ? { ...t, done } : t));
					updateUi(ctx);
					return {
						content: [{ type: "text", text: `Task #${task.id} ${done ? "completed" : "uncompleted"}` }],
						details: detailsFor("toggle"),
					};
				}

				case "clear": {
					const count = tasks.length;
					tasks = [];
					nextId = 1;
					updateUi(ctx);
					return {
						content: [{ type: "text", text: `Cleared ${count} tasks` }],
						details: detailsFor("clear"),
					};
				}

				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						details: detailsFor("list", `unknown action: ${params.action}`),
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

			let activeView: { component: TaskListComponent; requestRender: () => void } | undefined;
			try {
				await ctx.ui.custom<void>((tui, theme, _kb, done) => {
					const component = new TaskListComponent(() => tasks, theme, () => done());
					activeView = { component, requestRender: () => tui.requestRender() };
					activeViews.add(activeView);
					return component;
				});
			} finally {
				if (activeView) activeViews.delete(activeView);
			}
		},
	});
}
