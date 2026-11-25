import { createDrizzle } from "@@/core/domains/database/client.ts";
import { APP_DATA_READ_ONLY, APP_DATABASE_PATH } from "@@/core/utils/app-data-paths.ts";
import { createRuntime, type Runtime } from "./runtime.ts";

let productionRuntime: Runtime | undefined;

export function getProductionRuntime(): Runtime {
  productionRuntime ??= createRuntime(
    createDrizzle(APP_DATABASE_PATH, { readOnly: APP_DATA_READ_ONLY }),
  );

  return productionRuntime;
}
