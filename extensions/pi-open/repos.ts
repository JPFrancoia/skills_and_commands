import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type Repo = { host: string; path: string; forge: "gitlab" | "github" };

export function parseRepos(value: string | undefined): { repos: Repo[]; errors: string[] } {
	const repos: Repo[] = [];
	const errors: string[] = [];
	for (const raw of (value ?? "").split(",")) {
		const entry = raw.trim().replace(/\/+$/, "");
		if (!entry) continue;
		let url: URL;
		try {
			url = new URL(entry.includes("://") ? entry : `https://${entry}`);
		} catch {
			errors.push(`Not a URL: ${entry}`);
			continue;
		}
		const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
		const forge = url.hostname.startsWith("gitlab") ? "gitlab" : url.hostname.startsWith("github") ? "github" : undefined;
		if (!forge) errors.push(`Unsupported host (expected gitlab* or github*): ${entry}`);
		else if (!path.includes("/")) errors.push(`Not a repository path: ${entry}`);
		else repos.push({ host: url.hostname, path, forge });
	}
	return { repos, errors };
}

export type OpenRequestCount = {
	repo: Repo;
	count?: number;
	breakdown?: { drafts: number; passing: number; notPassing: number };
	error?: string;
};

export async function fetchOpenRequestCounts(pi: Pick<ExtensionAPI, "exec">, repos: Repo[]): Promise<OpenRequestCount[]> {
	return Promise.all(repos.map(async (repo): Promise<OpenRequestCount> => {
		try {
			const [owner, name, extra] = repo.path.split("/");
			if (repo.forge === "github" && (!owner || !name || extra !== undefined)) throw new Error("Invalid GitHub repository path");
			const bin = repo.forge === "gitlab" ? "glab" : "gh";
			const deadline = Date.now() + 15_000;
			const cursors = new Set<string>();
			const breakdown = { drafts: 0, passing: 0, notPassing: 0 };
			let count = 0;
			let cursor: string | undefined;
			do {
				const after = cursor ? `,after:${JSON.stringify(cursor)}` : "";
				const page = "pageInfo{hasNextPage endCursor}";
				const query = repo.forge === "gitlab"
					? `query{project(fullPath:${JSON.stringify(repo.path)}){mergeRequests(state:opened,first:100${after}){nodes{draft headPipeline{status}}${page}}}}`
					: `query{repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){pullRequests(states:OPEN,first:100${after}){nodes{isDraft commits(last:1){nodes{commit{statusCheckRollup{state}}}}}${page}}}}`;
				const timeout = deadline - Date.now();
				if (timeout <= 0) throw new Error("Open request refresh timed out");
				const result = await pi.exec(bin, ["api", "--hostname", repo.host, "graphql", "-f", `query=${query}`], { timeout });
				if (result.code !== 0) throw new Error(result.stderr.trim() || `${bin} exited with ${result.code}`);
				const data = JSON.parse(result.stdout);
				if (data.errors?.length) throw new Error(data.errors.map((error: { message?: string }) => error.message ?? "GraphQL error").join(", "));
				const connection = repo.forge === "gitlab" ? data.data?.project?.mergeRequests : data.data?.repository?.pullRequests;
				if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean") throw new Error("Open request data unavailable");
				for (const node of connection.nodes) {
					const draft = repo.forge === "gitlab" ? node?.draft : node?.isDraft;
					const ci = repo.forge === "gitlab" ? node?.headPipeline?.status : node?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
					if (typeof draft !== "boolean" || (ci != null && typeof ci !== "string")) throw new Error("Invalid draft or CI status");
					count++;
					if (draft) breakdown.drafts++;
					else if (ci === "SUCCESS") breakdown.passing++;
					else breakdown.notPassing++;
				}
				cursor = undefined;
				if (connection.pageInfo.hasNextPage) {
					const next = connection.pageInfo.endCursor;
					if (typeof next !== "string" || !next || cursors.has(next) || !connection.nodes.length) throw new Error("Invalid request pagination");
					cursors.add(next);
					cursor = next;
				}
			} while (cursor);
			return { repo, count, breakdown };
		} catch (error) {
			return { repo, error: error instanceof Error ? error.message : String(error) };
		}
	}));
}
