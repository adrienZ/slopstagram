import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

// Resolve the installed workspace package so bundled Nitro code keeps the same root.
export const SDK_PACKAGE_DIR = path.dirname(
  createRequire(import.meta.url).resolve("@slopstagram/sdk/package.json"),
);
export const PROJECT_ROOT_DIR = path.resolve(SDK_PACKAGE_DIR, "../..");
export const APP_DATA_DIR = path.resolve(
  PROJECT_ROOT_DIR,
  process.env.SLOPSTAGRAM_DATA_DIR ?? "data",
);
export const APP_CACHE_DIR = path.join(APP_DATA_DIR, "cache");
export const APP_DATABASE_PATH = path.join(APP_DATA_DIR, "slopstagram.sqlite");
export const PLAYWRIGHT_PROFILE_DIR = path.join(APP_DATA_DIR, "playwright", "user-data");
