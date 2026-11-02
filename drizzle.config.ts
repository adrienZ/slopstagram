import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./core/database/migrations",
  schema: "./core/database/entities/*.ts",
  dbCredentials: {
    url: "./data/slopstagram.sqlite",
  },
});
