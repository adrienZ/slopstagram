import path from "node:path";
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];

// The helper modules of a repository are named after it, next to the repository:
// `repositories/story-repository.ts` owns `repositories/story-repository.<aspect>.ts`. They take
// either the database or a transaction handle, so they stay functions, but only the owner may
// import them.
const REPOSITORIES = "/core/database/repositories/";
const HELPERS = /\/core\/database\/repositories\/(?<owner>[^/.]+)\.[^/]+\.ts$/u;

function resolveTarget(file: string, source: string): string | null {
  if (source.startsWith("@@/")) {
    return `/${source.slice(3)}`;
  }
  return source.startsWith(".") ? path.posix.resolve(path.posix.dirname(file), source) : null;
}

const privateRepositoryHelpers = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing the helper modules of a repository from anywhere but the repository.",
    },
    schema: [],
    messages: {
      private:
        "{{owner}}.*.ts holds helpers private to {{owner}}.ts. Call the repository method instead of importing the helper.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const target = resolveTarget(context.filename, node.source.value);
        const owner = target === null ? undefined : HELPERS.exec(target)?.groups?.owner;
        if (owner === undefined) {
          return;
        }
        const importer = HELPERS.exec(context.filename)?.groups?.owner;
        if (context.filename.endsWith(`${REPOSITORIES}${owner}.ts`) || importer === owner) {
          return;
        }
        context.report({ messageId: "private", node, data: { owner } });
      },
    };
  },
} satisfies Rule;

export default privateRepositoryHelpers;
