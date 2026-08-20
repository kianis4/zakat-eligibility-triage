import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { anthropic } from "@ai-sdk/anthropic";
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from "ai";

import { loadEvalFixtures } from "../src/lib/eval-fixture";
import { evaluateGates, exitCode } from "./gate";
import { judgeCorpus } from "./judge";
import { renderReport, renderSummary } from "./report";
import { assertCorpusIsWhole, scoreCorpus } from "./run";

const REPORT_PATH = fileURLToPath(new URL("./report.md", import.meta.url));

/**
 * The model whose behaviour is being measured, and the one measuring it.
 *
 * Different models on purpose. A judge that is the subject model is grading prose it would
 * have written the same way, which measures self-consistency by a second route after the
 * corpus already measures it by the first.
 */
const SUBJECT_MODEL = "claude-sonnet-5";
const JUDGE_MODEL = "claude-opus-5";

/**
 * Pins temperature to zero without changing any pipeline signature.
 *
 * The pipeline takes a `LanguageModel` and passes no call settings, which is the right shape
 * for production and leaves an eval run no way to ask for determinism. Middleware supplies
 * the setting at the model rather than at the call site, so the harness gets a reproducible
 * run and `extractFacts` and `mapCategories` keep the contract every other caller relies on.
 *
 * It buys reproducibility, not determinism. The same campaign can still map differently on
 * two runs, which is a property of the model rather than of this setting.
 */
function atTemperatureZero(modelId: string): LanguageModel {
  return wrapLanguageModel({
    model: anthropic(modelId),
    middleware: defaultSettingsMiddleware({ settings: { temperature: 0 } }),
  });
}

async function main(): Promise<never> {
  if ((process.env.ANTHROPIC_API_KEY ?? "").trim().length === 0) {
    process.stderr.write(
      [
        "ANTHROPIC_API_KEY is not set, so the eval harness cannot run.",
        "",
        "This is a failure rather than a skip on purpose. A gate that passes when the",
        "credential is missing is a gate that reports green for a run that never happened,",
        "which is worse than no gate at all.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const startedAt = new Date();
  const fixtures = await loadEvalFixtures();

  /**
   * Asserted here as well as inside `scoreCorpus`, which is the guard that cannot be
   * bypassed. This call is for the message: reaching it before the progress line below means
   * a gutted corpus reports itself as a gutted corpus, rather than printing that it is about
   * to run zero fixtures and then failing somewhere further down.
   */
  try {
    assertCorpusIsWhole(fixtures);
  } catch (thrown: unknown) {
    process.stderr.write(`${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `Running ${fixtures.length} fixtures against ${SUBJECT_MODEL}, judged by ${JUDGE_MODEL}.\n`,
  );

  const subject = atTemperatureZero(SUBJECT_MODEL);
  const deterministic = await scoreCorpus(fixtures, { extraction: subject, mapping: subject });
  const judge = await judgeCorpus(deterministic.fixtures, atTemperatureZero(JUDGE_MODEL));
  const gates = evaluateGates(deterministic, judge);
  const run = { deterministic, judge, gates, startedAt };

  await writeFile(REPORT_PATH, renderReport(run), "utf8");

  process.stdout.write(renderSummary(run));
  process.stdout.write(`Full report written to ${REPORT_PATH}\n`);

  process.exit(exitCode(gates));
}

/**
 * Called rather than awaited, because the package is CommonJS and a top-level await does not
 * survive the transform. The catch is the difference between a harness that crashes with a
 * stack trace and an exit code nobody set, and one that says what broke and fails the build
 * deliberately.
 */
main().catch((error: unknown) => {
  process.stderr.write(`The eval harness did not complete: ${String(error)}\n`);
  process.exit(1);
});
