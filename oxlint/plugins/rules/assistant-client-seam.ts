import path from "node:path";
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type ImportNode = Parameters<NonNullable<RuleVisitor["ImportDeclaration"]>>[0];
type ExportNode =
  | Parameters<NonNullable<RuleVisitor["ExportNamedDeclaration"]>>[0]
  | Parameters<NonNullable<RuleVisitor["ExportAllDeclaration"]>>[0];

// The app reaches the Assistant through its module's types; only the server routes call it. A tool
// module is reached only through the Assistant module, which composes it
// (docs/adr/0007-assistant-tools-live-in-their-domain.md). Type-only imports are erased at build
// time, so the AI SDK, the tool schemas and the repositories never reach the browser bundle.
const appFile = /\/app\//u;
const serverRoute = /\/app\/routes\/api\//u;
const assistantModule = /\/core\/domains\/assistant\//u;
const toolModule = /\.tool(?:\.ts)?$/u;

function resolveTarget(file: string, source: string): string {
  if (source.startsWith("@@/")) {
    return `/${source.slice(3)}`;
  }
  return source.startsWith(".") ? path.posix.resolve(path.posix.dirname(file), source) : source;
}

function isTypeOnly(node: ImportNode | ExportNode): boolean {
  if (node.type === "ExportAllDeclaration") {
    return node.exportKind === "type";
  }
  if (node.type === "ExportNamedDeclaration") {
    return (
      node.exportKind === "type" ||
      (node.specifiers.length > 0 &&
        node.specifiers.every((specifier) => specifier.exportKind === "type"))
    );
  }
  return (
    node.importKind === "type" ||
    (node.specifiers.length > 0 &&
      node.specifiers.every(
        (specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type",
      ))
  );
}

const assistantClientSeam = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow the app only type imports of the Assistant module, outside server routes, and no import of a tool module.",
    },
    schema: [],
    messages: {
      assistantValue:
        "Only server routes (app/routes/api) may import values from core/domains/assistant: import its types with `import type`. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
      toolModule:
        "The app never imports an Assistant tool module (*.tool.ts): go through core/domains/assistant. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
    },
  },
  create(context) {
    if (!appFile.test(context.filename)) {
      return {};
    }
    const isServerRoute = serverRoute.test(context.filename);
    function check(node: ImportNode | ExportNode) {
      const source = node.source?.value;
      if (source === undefined) {
        return;
      }
      const target = resolveTarget(context.filename, source);
      if (toolModule.test(target)) {
        context.report({ messageId: "toolModule", node });
      } else if (!isServerRoute && assistantModule.test(target) && !isTypeOnly(node)) {
        context.report({ messageId: "assistantValue", node });
      }
    }
    return {
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportDeclaration: check,
    };
  },
} satisfies Rule;

export default assistantClientSeam;
