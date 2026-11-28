import { defineConfig } from "drizzle-kit";
import { APP_DATABASE_PATH } from "./core/utils/app-data-paths.ts";

export default defineConfig({
  dialect: "sqlite",
  out: "./core/domains/database/migrations",
  schema: "./core/domains/database/entities/*.ts",
  dbCredentials: {
    url: APP_DATABASE_PATH,
  },
});
