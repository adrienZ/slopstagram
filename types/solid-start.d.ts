import type { AppData } from "../server/store.ts";

declare global {
  namespace App {
    interface RequestEventLocals {
      page?: AppData;
    }
  }
}
