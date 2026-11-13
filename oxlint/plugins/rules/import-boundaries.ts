import path from "node:path";
import type { RuleTester } from "oxlint/plugins-dev";
import { boundaries } from "../import-boundaries.ts";
import type { Boundary } from "../import-boundaries.ts";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type ModuleNode =
  | Parameters<NonNullable<RuleVisitor["ImportDeclaration"]>>[0]
  | Parameters<NonNullable<RuleVisitor["ExportNamedDeclaration"]>>[0]
  | Parameters<NonNullable<RuleVisitor["ExportAllDeclaration"]>>[0];
type ImportExpressionNode = Parameters<NonNullable<RuleVisitor["ImportExpression"]>>[0];
type ModuleExportName = { type: "Identifier"; name: string } | { type: "Literal"; value: unknown };

const aliases: Array<[prefix: string, target: string]> = [
  ["@@/", ""],
  ["@/", "app/"],
];

function matches(file: string, globs: Array<string> = []): boolean {
  return globs.some((glob) => path.matchesGlob(file, glob));
}

function resolveTarget(importer: string, source: string): string {
  const alias = aliases.find(([prefix]) => source.startsWith(prefix));
  if (alias) {
    return path.posix.normalize(alias[1] + source.slice(alias[0].length));
  }
  return source.startsWith(".") ? path.posix.join(path.posix.dirname(importer), source) : source;
}

function isErased(node: ModuleNode): boolean {
  return (node.type === "ImportDeclaration" ? node.importKind : node.exportKind) === "type";
}

function exportName(name: ModuleExportName): string {
  return name.type === "Identifier" ? name.name : String(name.value);
}

// The names a declaration takes from its source, or null when it takes the whole module.
function takenNames(node: ModuleNode): Array<string> | null {
  if (node.type === "ExportAllDeclaration") {
    return null;
  }
  if (node.type === "ExportNamedDeclaration") {
    return node.specifiers.map((specifier) => exportName(specifier.local));
  }
  if (node.specifiers.some((specifier) => specifier.type === "ImportNamespaceSpecifier")) {
    return null;
  }
  return node.specifiers.map((specifier) =>
    specifier.type === "ImportSpecifier" ? exportName(specifier.imported) : "default",
  );
}

// A dynamic import loads the whole module at runtime.
function crosses(boundary: Boundary, target: string, node: ModuleNode | null): boolean {
  if (!matches(target, boundary.forbid)) {
    return false;
  }
  if (node === null) {
    return true;
  }
  if (boundary.allow === "import-type" && isErased(node)) {
    return false;
  }
  const { names: forbiddenNames } = boundary;
  if (forbiddenNames === undefined) {
    return true;
  }
  const names = takenNames(node);
  return names === null || names.some((name) => forbiddenNames.includes(name));
}

const importBoundaries = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce the import boundaries declared in oxlint/plugins/import-boundaries.ts.",
    },
    schema: [],
    messages: Object.fromEntries(boundaries.map((boundary) => [boundary.name, boundary.because])),
  },
  create(context) {
    const importer = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    const active = boundaries.filter(
      (boundary) => matches(importer, boundary.importers) && !matches(importer, boundary.except),
    );
    if (active.length === 0) {
      return {};
    }
    function check(
      source: string,
      reported: ModuleNode | ImportExpressionNode,
      node: ModuleNode | null,
    ) {
      const target = resolveTarget(importer, source);
      for (const boundary of active) {
        if (crosses(boundary, target, node)) {
          context.report({ messageId: boundary.name, node: reported });
        }
      }
    }
    function checkDeclaration(node: ModuleNode) {
      if (node.source) {
        check(node.source.value, node, node);
      }
    }
    return {
      ExportAllDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ImportDeclaration: checkDeclaration,
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          check(String(node.source.value), node, null);
        }
      },
    };
  },
} satisfies Rule;

export default importBoundaries;
