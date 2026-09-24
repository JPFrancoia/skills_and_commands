import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
const BEANS_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*-[a-z0-9]{4}$/;
const BEANS_IDENTIFIER_IN_TEXT_PATTERN = /\b[a-z0-9]+(?:_[a-z0-9]+)*-[a-z0-9]{4}\b/g;

export function isBeansIdentifier(value: string): boolean {
	return BEANS_IDENTIFIER_PATTERN.test(value.trim());
}

export function findBeansIdentifier(value: string): string | null {
	return value.match(BEANS_IDENTIFIER_IN_TEXT_PATTERN)?.[0] ?? null;
}

export function parseBeansTitle(value: string): string | null {
	try {
		const title = (JSON.parse(value) as { title?: unknown }).title;
		return typeof title === "string" && title.trim() ? title.trim() : null;
	} catch {
		return null;
	}
}

export function redactBeansIdentifiers(value: string): string {
	return value.replace(BEANS_IDENTIFIER_IN_TEXT_PATTERN, "work item");
}

export function isValidGeneratedSessionName(value: string): boolean {
	return Boolean(value) && !isBeansIdentifier(value);
}

export function needsAutoName(sessionName: string | undefined): boolean {
	return !sessionName || isBeansIdentifier(sessionName);
}

export function parseModelRef(value: string): { provider: string; id: string } | null {
	const input = value.trim();
	const slashIndex = input.indexOf("/");
	if (slashIndex <= 0 || slashIndex === input.length - 1) return null;

	const provider = input.slice(0, slashIndex).trim();
	const id = input.slice(slashIndex + 1).trim();
	if (!provider || !id) return null;

	return { provider, id };
}

export function loadModelConfig(path = SETTINGS_PATH): { provider: string; id: string } | null {
	try {
		const settings = JSON.parse(readFileSync(path, "utf8")) as {
			autoRename?: { model?: unknown } | null;
		};
		const model = settings.autoRename?.model;
		return typeof model === "string" ? parseModelRef(model) : null;
	} catch {
		return null;
	}
}
