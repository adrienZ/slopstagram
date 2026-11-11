import aiSdkImports from "./rules/ai-sdk-imports.ts";
import assistantToolRegistry from "./rules/assistant-tool-registry.ts";
import domainLayering from "./rules/domain-layering.ts";
import noBarrelFiles from "./rules/no-barrel-files.ts";

const plugin = {
  meta: {
    name: "slopstagram",
    version: "1.0.0",
  },
  rules: {
    "ai-sdk-imports": aiSdkImports,
    "assistant-tool-registry": assistantToolRegistry,
    "domain-layering": domainLayering,
    "no-barrel-files": noBarrelFiles,
  },
};

export default plugin;
