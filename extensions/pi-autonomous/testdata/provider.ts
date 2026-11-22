import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export default function fixture(pi: ExtensionAPI) {
	const directory = process.env.AUTONOMOUS_TEST_DIR;
	if (!directory) throw new Error("This fixture requires AUTONOMOUS_TEST_DIR.");
	const mode = process.env.AUTONOMOUS_TEST_MODE;
	const provider = fauxProvider({ provider: "autonomous-test", tokensPerSecond: Infinity, models: [{ id: "fixture" }] });
	const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
	const steps = mode === "bean-waiting" || mode === "bean-unassigned" ? [
		call("autonomous_work", { action: "waiting", workerBeanIds: [process.env.AUTONOMOUS_TEST_SAFE ?? ""], reason: "An active worker runs the assigned Bean." }),
		call("fixture_work", {}),
		call("autonomous_work", { action: "idle", reason: "The worker and all remaining local work are complete." }),
	] : mode === "waiting" ? [
		call("autonomous_work", { action: "waiting", reason: "Example worker is active. No independent work remains." }),
		call("fixture_work", {}),
		call("autonomous_work", { action: "idle", reason: "The worker result is checked." }),
	] : mode === "deadline" ? [call("fixture_work", {}), call("fixture_work", {})] : mode === "question" ? [
		call("autonomous_work", { action: "status" }),
		call("ask_user_question", { questions: [{ question: "Approve the example merge?" }] }),
		call("autonomous_work", { action: "defer", task: "Example merge", beanId: process.env.AUTONOMOUS_TEST_APPROVAL ?? "", reason: "Approve the example merge?" }),
		call("fixture_work", {}),
		call("autonomous_work", { action: "idle", reason: "The safe task is complete. The remaining merge needs approval." }),
	] : mode === "empty" ? Array.from({ length: 5 }, () => fauxAssistantMessage("The next step is implementation.")) : [
		fauxAssistantMessage("The next step is a local check."),
		call("fixture_work", {}),
		call("autonomous_work", { action: "idle", reason: "The requested local check wrote the expected result." }),
	];
	provider.setResponses(steps.map((message) => () => {
		appendFileSync(join(directory, "calls.jsonl"), JSON.stringify(message.content) + "\n");
		return message;
	}));
	pi.registerProvider(provider.provider);
	pi.registerTool({
		name: "fixture_work", label: "Fixture work", description: "Write one local test result.", parameters: Type.Object({}),
		async execute() {
			if (mode === "deadline") await new Promise((resolve) => setTimeout(resolve, 100));
			if (process.env.AUTONOMOUS_TEST_SAFE) {
				execFileSync("beans", ["update", process.env.AUTONOMOUS_TEST_SAFE, "--status", "completed", "--json"], { cwd: directory });
			}
			for (const id of [process.env.AUTONOMOUS_TEST_EXTRA, process.env.AUTONOMOUS_TEST_ROOT]) {
				if (id) execFileSync("beans", ["update", id, "--status", "completed", "--json"], { cwd: directory });
			}
			writeFileSync(join(directory, "worked.txt"), "verified\n");
			return { content: [{ type: "text", text: "The local check passed." }], details: {} };
		},
	});
	pi.registerTool({
		name: "ask_user_question", label: "Fixture question", description: "Ask a test question.",
		parameters: Type.Object({ questions: Type.Array(Type.Object({ question: Type.String() })) }),
		async execute(_id, _args, _signal, _update, ctx) {
			writeFileSync(join(directory, "question-executed.txt"), "This must not happen.\n");
			await ctx.ui.confirm("Approval needed", "Approve the example merge?");
			return { content: [{ type: "text", text: "Answered" }], details: {} };
		},
	});
}
