import { globSync } from "node:fs";
import path from "node:path";
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type ImportNode = Parameters<NonNullable<RuleVisitor["ImportDeclaration"]>>[0];
type PropertyNode = Parameters<NonNullable<RuleVisitor["Property"]>>[0];
type ProgramNode = Parameters<NonNullable<RuleVisitor["Program"]>>[0];

/** `listAccounts` lives in `list-accounts.tool.ts`. */
function toolModuleName(toolName: string): string {
  return `${toolName.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.tool.ts`;
}

// The Assistant tool registry lists every Assistant tool module of the domains, and names each
// tool after its module, case included (docs/adr/0007-assistant-tools-live-in-their-domain.md).
// Enabled on the registry only, which sits in core/domains/assistant/.
const assistantToolRegistry = {
  meta: {
    type: "problem",
    docs: {
      description:
        "List every Assistant tool module in the registry, each tool named after its module: `listAccounts` comes from `list-accounts.tool.ts`.",
    },
    schema: [],
    messages: {
      mismatch:
        "The tool {{toolName}} must come from {{expected}}, not {{actual}}. Name the tool after its module, case included.",
      missing: "The Assistant tool module {{module}} is not in the registry.",
    },
  },
  create(context) {
    // The module of each factory imported from a tool module, by local name.
    const factoryModules = new Map<string, string>();
    const importedModules = new Set<string>();
    const domains = path.resolve(path.dirname(context.filename), "..");
    return {
      ImportDeclaration(node: ImportNode) {
        const source = node.source.value;
        if (!source.endsWith(".tool.ts")) {
          return;
        }
        importedModules.add(path.basename(source));
        for (const specifier of node.specifiers) {
          factoryModules.set(specifier.local.name, path.basename(source));
        }
      },
      Property(node: PropertyNode) {
        if (node.computed || node.key.type !== "Identifier" || node.value.type !== "Identifier") {
          return;
        }
        const actual = factoryModules.get(node.value.name);
        const expected = toolModuleName(node.key.name);
        if (actual !== undefined && actual !== expected) {
          context.report({
            messageId: "mismatch",
            node,
            data: { toolName: node.key.name, expected, actual },
          });
        }
      },
      "Program:exit"(node: ProgramNode) {
        for (const module of globSync("**/*.tool.ts", { cwd: domains }).toSorted()) {
          if (!importedModules.has(path.basename(module))) {
            context.report({ messageId: "missing", node, data: { module } });
          }
        }
      },
    };
  },
} satisfies Rule;

export default assistantToolRegistry;
