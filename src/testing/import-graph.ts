import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = fileURLToPath(new URL("../", import.meta.url));

const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
];

const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

async function resolveSpecifier(fromFile: string, specifier: string): Promise<string | null> {
  const base = specifier.startsWith("@/")
    ? resolve(SRC_DIR, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;

  if (base === null) {
    return null;
  }

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    const found = await stat(candidate).catch(() => null);

    if (found?.isFile() === true) {
      return candidate;
    }
  }

  return null;
}

/**
 * Every first-party module reachable from an entry point, by reading the files.
 *
 * The point of doing it this way is that it answers a question mocking cannot. A test
 * that stubs a module proves what happened on one run; this proves that a path does not
 * exist, including the transitive one someone adds three modules away without noticing
 * what it connects.
 *
 * Package specifiers are skipped, since the rule being guarded is about this repository's
 * own modules. Specifiers are matched textually rather than parsed into an AST, so a
 * string in a comment can be picked up as an edge. That direction is the safe one: the
 * guard reports a link that is not there rather than missing one that is.
 */
export async function collectImportGraph(entry: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [resolve(entry)];

  while (queue.length > 0) {
    const file = queue.pop() as string;

    if (seen.has(file)) {
      continue;
    }

    seen.add(file);
    const source = await readFile(file, "utf8");

    for (const pattern of SPECIFIER_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const resolved = await resolveSpecifier(file, match[1] as string);

        if (resolved !== null && !seen.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
  }

  return [...seen];
}
