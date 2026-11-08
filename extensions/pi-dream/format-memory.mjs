import {
  mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { frontMatter, memoryFiles, withLock } from "./store.mjs";

export async function formatMarkdown(content) {
  const metadata = frontMatter(content);
  const { format } = await import("prettier").catch((error) => {
    throw new Error("The Markdown formatter is unavailable. Run npm ci in the pi-dream package directory.", { cause: error });
  });
  const formatted = await format(content, {
    parser: "markdown",
    printWidth: 79,
    proseWrap: "always",
    embeddedLanguageFormatting: "off",
    endOfLine: "lf",
  });
  const result = frontMatter(formatted);
  if (result.description !== metadata.description || result.scope !== metadata.scope) {
    throw new Error("The Markdown formatter changed memory metadata. Keep description and scope on single lines.");
  }
  return formatted;
}

export function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.pi-dream-${process.pid}-${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });
    renameSync(tempPath, path);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export async function formatMemoryDirectory(root) {
  if (!statSync(root).isDirectory()) throw new Error("The memory root must be a directory.");
  return withLock(join(root, ".edit-lock"), async () => {
    const paths = memoryFiles(root);
    const changes = [];
    for (const path of paths) {
      const absolute = join(root, path);
      const original = readFileSync(absolute, "utf8");
      let formatted;
      try {
        formatted = await formatMarkdown(original);
      } catch (error) {
        throw new Error(`Cannot format ${path}: ${error.message}`, { cause: error });
      }
      if (formatted !== original) changes.push({ absolute, original, formatted });
    }
    // Formatting yields to other processes, so check paths and content again before writing.
    memoryFiles(root);
    for (const { absolute, original } of changes) {
      if (readFileSync(absolute, "utf8") !== original) {
        throw new Error(`The memory file changed during formatting: ${absolute}`);
      }
    }
    for (const { absolute, formatted } of changes) atomicWrite(absolute, formatted);
    return { changed: changes.length, total: paths.length };
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: node format-memory.mjs <memory-directory>\n");
    process.exitCode = 2;
  } else {
    try {
      const result = await formatMemoryDirectory(resolve(process.argv[2]));
      console.log(`Formatted ${result.changed} of ${result.total} Markdown file(s).`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
