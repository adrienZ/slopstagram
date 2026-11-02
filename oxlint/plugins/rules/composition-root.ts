import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type NewNode = Parameters<NonNullable<RuleVisitor["NewExpression"]>>[0];
type CallNode = Parameters<NonNullable<RuleVisitor["CallExpression"]>>[0];

// Only the composition root, core/runtime, builds what holds state: the repositories, the database and the stores.
const compositionRoot = /\/core\/runtime\//u;
const openers = new Set([
  "DatabaseSync",
  "createDrizzle",
  "createFileCacheStorage",
  "createStorage",
]);
const rootOnly = new Set(["createDrizzle", "createFileCacheStorage"]);

function calleeName(callee: NewNode["callee"]): string | null {
  return callee.type === "Identifier" ? callee.name : null;
}

const noRepositoryOutsideRoot = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only the composition root builds repositories, opens the database or a store, and no module-level code does.",
    },
    schema: [],
    messages: {
      repository:
        "Only the composition root (core/runtime) constructs repositories. Take the runtime or the repository as a parameter.",
      opener:
        "Only the composition root (core/runtime) opens the database or a store. Take the runtime as a parameter.",
      moduleLevel:
        "Module-level code cannot open the database or a store, or build a repository. Do it inside a function.",
    },
  },
  create(context) {
    const isRoot = compositionRoot.test(context.filename);
    let functionDepth = 0;
    function enter() {
      functionDepth += 1;
    }
    function exit() {
      functionDepth -= 1;
    }
    function check(node: NewNode | CallNode, name: string | null) {
      if (name === null) {
        return;
      }
      const isRepository = name.endsWith("Repository");
      if (!isRepository && !openers.has(name)) {
        return;
      }
      if (functionDepth === 0) {
        context.report({ messageId: "moduleLevel", node });
      } else if (!isRoot && (isRepository || rootOnly.has(name))) {
        context.report({ messageId: isRepository ? "repository" : "opener", node });
      }
    }
    return {
      ArrowFunctionExpression: enter,
      "ArrowFunctionExpression:exit": exit,
      FunctionDeclaration: enter,
      "FunctionDeclaration:exit": exit,
      FunctionExpression: enter,
      "FunctionExpression:exit": exit,
      NewExpression(node) {
        check(node, calleeName(node.callee));
      },
      CallExpression(node) {
        check(node, calleeName(node.callee));
      },
    };
  },
} satisfies Rule;

export default noRepositoryOutsideRoot;
