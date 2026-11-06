import { createDrizzle } from "@@/core/domains/database/client.ts";
import { APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createRuntime, type Runtime } from "@@/core/domains/runtime/runtime.ts";

let productionRuntime: Runtime | undefined;

export function getProductionRuntime(): Runtime {
  productionRuntime ??= createRuntime(createDrizzle(APP_DATABASE_PATH));
  return productionRuntime;
}
