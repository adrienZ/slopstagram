import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { z } from "zod";

// The developer's own database, not the test one: the accounts they really follow.
const LOCAL_DATABASE = path.resolve("data", "slopstagram.sqlite");
// Shorter names are too common in synthetic data (a username such as "alice") to be told apart.
const MIN_TERM_LENGTH = 6;
const BINARY_EXTENSIONS = new Set([".m4a", ".mp4", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const IGNORED_FILES = new Set(["package-lock.json"]);

const AccountRowSchema = z.object({
  fullName: z.string().nullable(),
  username: z.string(),
});

interface Finding {
  file: string;
  line: number;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/** The positions in a text where one of the terms appears as a whole word, ignoring case. */
function findTerms(text: string, terms: Array<string>): Array<number> {
  if (terms.length === 0) {
    return [];
  }
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_.])(?:${terms.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
    "iu",
  );
  return text.split("\n").flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}

function listTrackedFiles(): Array<string> {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf-8",
  })
    .split("\0")
    .filter(
      (file) =>
        file !== "" &&
        !IGNORED_FILES.has(file) &&
        !BINARY_EXTENSIONS.has(path.extname(file).toLowerCase()) &&
        // A symbolic link, such as .claude/skills, points at files that are tracked themselves.
        lstatSync(file).isFile(),
    );
}

function readLocalTerms(): Array<string> {
  const database = new DatabaseSync(LOCAL_DATABASE, { readOnly: true });
  try {
    const rows = database
      .prepare("select fullName, username from instagram_users")
      .all()
      .map((row) => AccountRowSchema.parse(row));
    return [
      ...new Set(
        rows
          .flatMap(({ fullName, username }) => [username, fullName ?? ""])
          .map((term) => term.trim())
          .filter((term) => term.length >= MIN_TERM_LENGTH),
      ),
    ];
  } finally {
    database.close();
  }
}

test("a term of the list is found as a whole word, whatever its case", () => {
  const text = "first line\nthe account ZORGLUB_99 follows\nzorglub_999 is another one";

  expect(findTerms(text, ["zorglub_99"])).toStrictEqual([2]);
  expect(findTerms(text, [])).toStrictEqual([]);
});

// Never print what matched: the failure would copy the personal data into the test output.
test.skipIf(!existsSync(LOCAL_DATABASE))(
  "no source file names an account of the local database",
  () => {
    const terms = readLocalTerms();
    const findings: Array<Finding> = listTrackedFiles().flatMap((file) =>
      findTerms(readFileSync(file, "utf-8"), terms).map((line) => ({ file, line })),
    );

    expect(terms.length).toBeGreaterThan(0);
    expect(findings).toStrictEqual([]);
  },
);
