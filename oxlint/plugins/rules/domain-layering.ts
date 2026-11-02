import path from "node:path";
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleVisitor = ReturnType<NonNullable<Rule["create"]>>;
type ImportNode = Parameters<NonNullable<RuleVisitor["ImportDeclaration"]>>[0];

// Value imports between core domains must point down this table. fetch-run sits on top: it may
// import any domain and no domain imports it. Type-only imports are always allowed.
const dependencies = new Map<string, Array<string>>([
  ["utils", []],
  ["database", ["utils"]],
  ["instagram", ["database", "utils"]],
  ["media-store", ["utils"]],
  ["stickers", ["database", "utils"]],
  ["places", ["database", "utils"]],
  ["music", ["database", "media-store", "utils"]],
  ["vision", ["database", "media-store", "utils"]],
  ["accounts", ["database", "vision", "utils"]],
  ["story-feed", ["database", "vision", "utils"]],
  ["fetch-run", ["*"]],
]);

// Violations that exist today, per importing module. The list can only shrink: a new violation
// fails lint. The repository shape spec (#157) and the composition root spec (#159) remove them.
const baseline = new Map<string, Array<string>>([
  // #157: the report entity imports the story media types, which belong to stickers.
  ["database/entities/report.ts", ["stickers"]],
  // #157: repositories call the planners of the domains they persist.
  ["database/repositories/story-repository/location-metadata-repository.ts", ["places"]],
  ["database/repositories/story-repository/music-metadata-repository.ts", ["music"]],
  // #157: the report repository validates payloads and reads story output.
  ["database/repositories/report-repository.ts", ["fetch-run", "instagram"]],
  // #157: the story repository calls the annotation, audio and payload planners.
  ["database/repositories/story-repository.ts", ["instagram", "music", "stickers"]],
  // #159: stickers, places and music import each other through sticker and location extraction.
  ["places/location-metadata.ts", ["stickers"]],
  ["stickers/story-sticker-location.ts", ["music", "places"]],
]);

// "core/<domain>/<module>" as ["<domain>", "<domain>/<module>"], or null outside core.
function locate(file: string): [string, string] | null {
  const match = /\/core\/(?<module>(?<domain>[^/]+)\/.+)$/u.exec(file);
  return match?.groups ? [match.groups.domain, match.groups.module] : null;
}

function isTypeOnly(node: ImportNode): boolean {
  return (
    node.importKind === "type" ||
    (node.specifiers.length > 0 &&
      node.specifiers.every(
        (specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type",
      ))
  );
}

function resolveTarget(file: string, source: string): string | null {
  if (source.startsWith("@@/")) {
    return `/${source.slice(3)}`;
  }
  return source.startsWith(".") ? path.posix.resolve(path.posix.dirname(file), source) : null;
}

const domainLayering = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow value imports that point up the layering of the core domains.",
    },
    schema: [],
    messages: {
      upward:
        "core/{{importer}} cannot import core/{{imported}}. Import types only, or move the code. See oxlint/plugins/rules/domain-layering.ts.",
    },
  },
  create(context) {
    const importerAt = locate(context.filename);
    return {
      ImportDeclaration(node) {
        if (importerAt === null || isTypeOnly(node)) {
          return;
        }
        const source = node.source.value;
        const target = resolveTarget(context.filename, source);
        const importedAt = target === null ? null : locate(target);
        if (!importedAt) {
          return;
        }
        const [importer, module] = importerAt;
        const [imported] = importedAt;
        const allowed = dependencies.get(importer) ?? [];
        if (
          imported === importer ||
          allowed.includes("*") ||
          allowed.includes(imported) ||
          baseline.get(module)?.includes(imported) === true
        ) {
          return;
        }
        context.report({ messageId: "upward", node, data: { importer, imported } });
      },
    };
  },
} satisfies Rule;

export default domainLayering;
