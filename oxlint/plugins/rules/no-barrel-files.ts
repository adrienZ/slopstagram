import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type ProgramNode = Parameters<NonNullable<RuleVisitor["Program"]>>[0];
type ModuleStatement = ProgramNode["body"][number];

function isReexport(statement: ModuleStatement): boolean {
  return (
    statement.type === "ExportAllDeclaration" ||
    (statement.type === "ExportNamedDeclaration" && statement.source !== null)
  );
}

const noBarrelFiles = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow files whose only statements re-export other modules.",
    },
    schema: [],
    messages: {
      barrel:
        "Avoid barrel files. Import from the owning module and export declarations where they are defined.",
    },
  },
  create(context) {
    return {
      Program(node) {
        if (node.body.length > 0 && node.body.every(isReexport)) {
          context.report({ messageId: "barrel", node: node.body[0] });
        }
      },
    };
  },
} satisfies Rule;

const plugin = {
  meta: {
    name: "slopstagram",
    version: "1.0.0",
  },
  rules: {
    "no-barrel-files": noBarrelFiles,
  },
};

export default plugin;
