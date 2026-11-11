import aiSdkImports from "./rules/ai-sdk-imports.ts";
import assistantClientSeam from "./rules/assistant-client-seam.ts";
import domainLayering from "./rules/domain-layering.ts";
import noBarrelFiles from "./rules/no-barrel-files.ts";

const plugin = {
  meta: {
    name: "slopstagram",
    version: "1.0.0",
  },
  rules: {
    "ai-sdk-imports": aiSdkImports,
    "assistant-client-seam": assistantClientSeam,
    "domain-layering": domainLayering,
    "no-barrel-files": noBarrelFiles,
  },
};

export default plugin;
