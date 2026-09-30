/**
 * pi-mcp-status — show servers with available MCP tools in Pi's footer.
 *
 * Install by symlinking this file into ~/.pi/agent/extensions/ and running /reload.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	const stop = () => {
		clearInterval(timer);
		timer = undefined;
	};
	const update = (ctx: ExtensionContext) => {
		// ponytail: registered tools can outlive disconnects; use connection events when Pi exposes them.
		const servers = new Set(pi.getAllTools()
			.filter((tool) => tool.exposure !== "hidden" && tool.namespace?.name.startsWith("mcp__"))
			.map((tool) => tool.namespace!.name));
		ctx.ui.setStatus("mcp-status", ctx.ui.theme.fg("dim", `🔌 ${servers.size}`));
	};

	pi.on("session_start", (_event, ctx) => {
		stop();
		if (!ctx.hasUI) return;
		update(ctx);
		timer = setInterval(() => update(ctx), 1000);
		timer.unref();
	});
	pi.on("session_shutdown", (_event, ctx) => {
		stop();
		ctx.ui.setStatus("mcp-status", undefined);
	});
}
