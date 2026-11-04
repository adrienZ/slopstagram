import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./core/domains/database/migrations",
  schema: "./core/domains/database/entities/*.ts",
  dbCredentials: {
    url: "./data/slopstagram.sqlite",
  },
});
