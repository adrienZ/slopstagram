import { expect, test } from "vitest";
import { LogLevels, type LogObject } from "consola";
import { createLogger } from "../sdk/lib/logging-service.ts";

test("logger messages carry the logger prefix as their tag", () => {
  const logger = createLogger("fetch-stories");
  const messages: Array<LogObject> = [];
  logger.level = LogLevels.info;
  logger.setReporters([
    {
      log: (message) => {
        messages.push(message);
      },
    },
  ]);

  logger.info("tray fetched");

  expect(messages.map(({ tag, args }) => ({ tag, args }))).toEqual([
    { tag: "fetch-stories", args: ["tray fetched"] },
  ]);
});
