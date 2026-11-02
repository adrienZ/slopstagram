import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { expect, test } from "vitest";
import { createBuilder } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

function filesUnder(directory: string): Array<string> {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

test("the production build ships the database migrations next to the server bundle", async () => {
  const builder = await createBuilder({ root, logLevel: "silent" });
  await builder.buildApp();

  // migrateDatabase resolves its folder from the bundled file, which is .output/server/index.mjs.
  const shipped = filesUnder(path.join(root, ".output/server/migrations"));
  expect(shipped).toStrictEqual(filesUnder(path.join(root, "core/database/migrations")));
}, 120_000);
