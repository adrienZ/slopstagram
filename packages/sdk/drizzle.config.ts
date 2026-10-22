import { defineConfig } from "drizzle-kit";
import { APP_DATABASE_PATH } from "./lib/app-data-paths.ts";

export default defineConfig({
  dialect: "sqlite",
  out: "./database/migrations",
  schema: "./entities/*.ts",
  dbCredentials: { url: APP_DATABASE_PATH },
});
