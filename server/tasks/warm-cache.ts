import { defineTask } from "nitro/task";
import { z } from "zod";
import { createReport } from "../../sdk/index.ts";
import { createLogger } from "../../sdk/lib/logging-service.ts";

const WarmCachePayloadSchema = z.object({
  args: z.array(z.string()).optional(),
  reportArgs: z.array(z.string()).optional(),
});

export default defineTask({
  meta: {
    name: "warm-cache",
    description: "Create a stories report and refresh the local report cache",
  },
  async run(event) {
    const logger = createLogger("warm-cache-task");
    const payload = WarmCachePayloadSchema.parse(event.payload);
    const result = await createReport({
      args: payload.reportArgs ?? payload.args ?? [],
      logger,
    });

    return {
      result: {
        outputFileName: result.outputFileName,
        outputPath: result.outputPath,
        counts: result.report.metadata.counts,
      },
    };
  },
});
