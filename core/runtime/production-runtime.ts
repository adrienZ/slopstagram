import { createDrizzle } from "@@/core/database/client.ts";
import { APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createRuntime, type Runtime } from "./runtime.ts";

let productionRuntime: Runtime | undefined;

/**
 * The runtime over the application database, created on the first call and reused after.
 * Calling it is what opens the database: importing this module opens nothing.
 */
export function getProductionRuntime(): Runtime {
  productionRuntime ??= createRuntime(createDrizzle(APP_DATABASE_PATH));
  return productionRuntime;
}
