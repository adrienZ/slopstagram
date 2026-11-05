import { readFileSync } from "node:fs";
import process from "node:process";
import { z } from "zod";
import config from "../evalite.config.ts";

/** What `npm run eval` writes to its `--outputPath`, reduced to what the summary shows. */
const ResultsSchema = z.object({
  suites: z.array(
    z.object({
      name: z.string(),
      averageScore: z.number(),
      evals: z.array(
        z.object({
          status: z.string(),
          averageScore: z.number(),
          renderedColumns: z.array(z.object({ label: z.string(), value: z.string() })),
          scores: z.array(
            z.object({
              name: z.string(),
              score: z.number().nullable(),
              description: z.string().nullish(),
            }),
          ),
        }),
      ),
    }),
  ),
});

type Suite = z.infer<typeof ResultsSchema>["suites"][number];
type Trial = Suite["evals"][number];

const ANSWER_LENGTH = 240;

function percent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function mean(values: Array<number>): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

/** One table cell: no pipe or line break, which would split the row. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll(/\s+/gu, " ").trim();
}

function shorten(text: string): string {
  return text.length > ANSWER_LENGTH ? `${text.slice(0, ANSWER_LENGTH)}…` : text;
}

function describeTrial(trial: Trial, index: number): string {
  const columns = trial.renderedColumns.map(
    ({ label, value }) => `**${label}:** ${shorten(cell(value))}`,
  );
  const missed = trial.scores
    .filter(({ score }) => score !== null && score < 1)
    .map(({ name, score }) => `${name} ${percent(score ?? 0)}`);
  return [
    `${index + 1}. ${percent(trial.averageScore)} (${trial.status})`,
    ...columns.map((column) => `   - ${column}`),
    ...(missed.length > 0 ? [`   - **Below 100%:** ${missed.join(", ")}`] : []),
  ].join("\n");
}

function describeSuite(suite: Suite): string {
  return [
    `<details><summary>${cell(suite.name)}: ${percent(suite.averageScore)}</summary>`,
    "",
    ...suite.evals.map(describeTrial),
    "",
    "</details>",
  ].join("\n");
}

/** The evals report as Markdown, for the job summary of a GitHub Actions run. */
function summarize(results: z.infer<typeof ResultsSchema>): string {
  const trials = results.suites.flatMap(({ evals }) => evals);
  const average = mean(trials.map(({ averageScore }) => averageScore));
  const threshold = config.scoreThreshold ?? 0;
  const verdict = average * 100 >= threshold ? "passed" : "failed";
  return [
    `## Assistant evals: ${percent(average)}, ${verdict} (threshold ${threshold}%)`,
    "",
    "| Case | Score | Trials |",
    "| --- | --- | --- |",
    ...results.suites.map(
      (suite) => `| ${cell(suite.name)} | ${percent(suite.averageScore)} | ${suite.evals.length} |`,
    ),
    "",
    ...results.suites.map(describeSuite),
    "",
    "The full report, with the traces, is the `evalite-report` artifact of this run.",
    "",
  ].join("\n");
}

const path = process.argv.at(2);
if (path === undefined) {
  throw new Error("Usage: node evals/job-summary.ts <last-run.json>");
}
process.stdout.write(summarize(ResultsSchema.parse(JSON.parse(readFileSync(path, "utf-8")))));
