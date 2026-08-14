import path from "node:path";

export const APP_DATA_DIR = path.resolve("data");
export const APP_CACHE_DIR = path.join(APP_DATA_DIR, "cache");
export const PLAYWRIGHT_PROFILE_DIR = path.join(APP_DATA_DIR, "playwright", "user-data");
