import domainLayering from "./rules/domain-layering.ts";
import noBarrelFiles from "./rules/no-barrel-files.ts";
import privateRepositoryHelpers from "./rules/private-repository-helpers.ts";

const plugin = {
  meta: {
    name: "slopstagram",
    version: "1.0.0",
  },
  rules: {
    "domain-layering": domainLayering,
    "no-barrel-files": noBarrelFiles,
    "private-repository-helpers": privateRepositoryHelpers,
  },
};

export default plugin;
