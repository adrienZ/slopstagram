import path from "node:path";
import process from "node:process";

const APP_DATA_DIR = path.resolve(process.env.SLOPSTAGRAM_DATA_DIR ?? "data/default");
export const APP_CACHE_DIR = path.join(APP_DATA_DIR, "cache");

export const APP_DATABASE_PATH =
  process.env.SLOPSTAGRAM_DATABASE_PATH ?? path.join(APP_DATA_DIR, "slopstagram.sqlite");

/** @public */
export const APP_BUNQUEUE_PATH = path.join(APP_DATA_DIR, "bunq.db");

export const APP_BACKUPS_DIR = path.join(APP_DATA_DIR, "backups");
export const PLAYWRIGHT_PROFILE_DIR = path.join(APP_DATA_DIR, "playwright", "user-data");
