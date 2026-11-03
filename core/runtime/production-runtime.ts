import { createDrizzle } from "@@/core/database/client.ts";
import { APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createRuntime, type Runtime } from "./runtime.ts";

let productionRuntime: Runtime | undefined;

export function getProductionRuntime(): Runtime {
  productionRuntime ??= createRuntime(createDrizzle(APP_DATABASE_PATH));
  return productionRuntime;
}
