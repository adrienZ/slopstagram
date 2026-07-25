import { createStorage, prefixStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

const BASE_CACHE_DIR = ".tmp";

export const baseStorage = createStorage({
  driver: fsDriver({
    base: BASE_CACHE_DIR,
  }),
});

export const reportsStorage = prefixStorage(baseStorage, "reports");
export const storiesStorage = prefixStorage(baseStorage, "stories");

