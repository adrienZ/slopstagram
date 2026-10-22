import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./sdk/database/migrations",
  schema: "./sdk/entities/*.ts",
});
