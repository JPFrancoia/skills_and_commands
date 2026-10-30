import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REMINDER =
	"Use ASD-STE100 Simplified Technical English for prose. Use short, direct sentences and active voice. Preserve code identifiers, commands, file paths, error messages, and quoted text exactly. If docs/CONTEXT.md exists, use its defined terms consistently. Otherwise, prefer common words. Define each necessary technical term at first use.";

export default function simpleLanguageReminder(pi: ExtensionAPI) {
	pi.on("context", (event) => ({
		messages: [
			...event.messages,
			{
				role: "custom",
				customType: "simple-language-reminder",
				content: REMINDER,
				display: false,
				timestamp: Date.now(),
			},
		],
	}));
}
