/**
 * Rapsodia Context — keeps the project prelude fresh when a Pi session starts.
 *
 * The CLI owns prelude production (`rapso context`); this extension only schedules it and points
 * the first run of the session at the result. It never opens an Engram session: gentle-engram owns
 * the session lifecycle, and two owners of one session would double-write memory.
 *
 * It fails soft. A missing or older `rapso`, a slow refresh, or a broken dependency must never
 * block the first prompt, so the refresh runs in the background and the pointer is written from
 * whatever is on disk. Pi loads project extensions only after project trust is granted; without
 * trust, the rule in AGENTS.md ("read .rapsodia-code/prelude.md at session start") is the fallback.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STATE_DIR = ".rapsodia-code";
const PRELUDE_FILE = "prelude.md";
const REFRESH_TIMEOUT_MS = 60_000;
/** A prelude this recent already reflects what this session would produce. */
const FRESH_MS = 5 * 60_000;
/** A CLI that predates `rapso context` cannot refresh anything, and saying so every start is noise. */
const UNKNOWN_COMMAND = /unknown command/i;

/** Walk up from the session directory to the project that owns the Rapsodia state. */
function findProjectRoot(start) {
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, STATE_DIR))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** `null` when the file is absent, so "not built yet" stays distinguishable from "built long ago". */
function preludeAgeMs(path) {
	try {
		return Date.now() - statSync(path).mtimeMs;
	} catch {
		return null;
	}
}

/**
 * An npm global install on Windows puts `rapso.cmd` on PATH, and `spawn` without a shell cannot run
 * a `.cmd`; asking for `rapso` there fails silently. `RAPSO_BIN` overrides both, for a native
 * `.exe`, a local build, or a test shim.
 */
function rapsoCommand() {
	if (process.env.RAPSO_BIN) return process.env.RAPSO_BIN;
	return process.platform === "win32" ? "rapso.cmd" : "rapso";
}

function describeAge(ageMs) {
	if (ageMs < 60_000) return "just now";
	return `${Math.round(ageMs / 60_000)} min ago`;
}

export default function rapsodiaContext(pi) {
	let refreshInFlight = null;
	let pointedAtPrelude = false;

	async function refresh(ctx, projectRoot) {
		const command = rapsoCommand();
		let result;
		try {
			result = await pi.exec(command, ["context"], { cwd: projectRoot, timeout: REFRESH_TIMEOUT_MS });
		} catch {
			// `rapso` is not installed or not executable here; the prelude stays as it is.
			return;
		}
		if (result.code === 0) return;
		if (UNKNOWN_COMMAND.test(result.stderr) || UNKNOWN_COMMAND.test(result.stdout)) return;
		if (ctx.hasUI) {
			ctx.ui.notify(`Rapsodia: the prelude refresh failed (rapso context exited ${result.code})`, "warning");
		}
	}

	pi.on("session_start", (event, ctx) => {
		pointedAtPrelude = false;
		refreshInFlight = null;
		const projectRoot = findProjectRoot(ctx.cwd);
		if (!projectRoot) return;
		const age = preludeAgeMs(join(projectRoot, STATE_DIR, PRELUDE_FILE));
		if (age !== null && age < FRESH_MS) return;
		refreshInFlight = refresh(ctx, projectRoot).finally(() => {
			refreshInFlight = null;
		});
	});

	pi.on("before_agent_start", (event, ctx) => {
		// A run started by another extension is not a task; do not spend its prompt on the pointer.
		if (pointedAtPrelude || event.messageType !== "user") return;
		const projectRoot = findProjectRoot(ctx.cwd);
		if (!projectRoot) return;
		const age = preludeAgeMs(join(projectRoot, STATE_DIR, PRELUDE_FILE));
		// Nothing on disk and no refresh coming: there is nothing honest to point at.
		if (age === null && !refreshInFlight) return;
		pointedAtPrelude = true;
		const state = age === null ? "being refreshed now" : `last refreshed ${describeAge(age)}`;
		event.systemPromptOptions.sections.rapsodia_context = [
			`Project prelude: \`${STATE_DIR}/${PRELUDE_FILE}\` (${state}).`,
			"Read it before the first task: it carries the Engram context, the Graphify report, and the project metadata.",
		].join("\n");
	});
}
