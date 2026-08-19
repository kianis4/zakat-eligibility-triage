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
 * own modules.
 *
 * What textual matching guarantees is narrower than it looks, and the limit is worth
 * stating because a guard is only as good as its weakest edge case. It finds specifiers
 * written as literal strings, in either quote style. It over-reports, since a specifier
 * inside a comment or a string still counts as an edge, which is the harmless direction.
 * It also under-reports, and that direction is not harmless: a template literal such as
 * ``import(`./precedent`)``, a concatenated specifier, or anything else computed at
 * runtime is invisible here, because the specifier is not a literal in the source.
 *
 * The under-reporting is closed by the caller rather than by more regular expressions.
 * `src/lib/__tests__/precedent-isolation.test.ts` separately asserts that no module in
 * the fenced graph contains a dynamic import expression at all, so there is nothing of
 * that shape for this walker to miss.
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
