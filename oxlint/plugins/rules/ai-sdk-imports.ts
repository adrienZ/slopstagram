import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type ModuleNode =
  | Parameters<NonNullable<RuleVisitor["ImportDeclaration"]>>[0]
  | Parameters<NonNullable<RuleVisitor["ExportNamedDeclaration"]>>[0]
  | Parameters<NonNullable<RuleVisitor["ExportAllDeclaration"]>>[0];

// The AI SDK, its UI bindings and its providers.
const aiSdkSource = /^(?:ai|ai-sdk-ollama|@ai-sdk\/[^/]+)(?:\/.*)?$/u;

// Only Assistant tool modules, the Assistant domain and the chat page's hook may import the AI SDK
// (docs/adr/0007-assistant-tools-live-in-their-domain.md), plus the tests that drive them.
const allowedImporters = [
  /\.tool\.ts$/u,
  /\/core\/domains\/assistant\//u,
  /\/app\/hooks\/use-assistant-chat\.ts$/u,
  /\/tests\//u,
];

const aiSdkImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow AI SDK imports only in Assistant tool modules, the Assistant domain and the chat hook.",
    },
    schema: [],
    messages: {
      restricted:
        "Only Assistant tool modules (*.tool.ts), core/domains/assistant and app/hooks/use-assistant-chat.ts may import {{source}}. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
    },
  },
  create(context) {
    const allowed = allowedImporters.some((pattern) => pattern.test(context.filename));
    function check(node: ModuleNode) {
      const source = node.source?.value;
      if (!allowed && source !== undefined && aiSdkSource.test(source)) {
        context.report({ messageId: "restricted", node, data: { source } });
      }
    }
    return {
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportDeclaration: check,
    };
  },
} satisfies Rule;

export default aiSdkImports;
