import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
	const source = join(
		homedir(),
		"informatique",
		"ai",
		"skills_and_commands",
		"extensions",
		"pi-quotas",
		"src",
		"extensions",
		"usage-status",
		"index.ts",
	);
	const { default: usageStatusExtension } = await import(source);
	await usageStatusExtension(pi);
}
