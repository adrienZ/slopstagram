import { defineEventHandler } from "nitro/h3";
import { loadReport } from "../../report-handler.tsx";

export default defineEventHandler((event) => ({
  page: "report" as const,
  props: loadReport(event.url),
}));
