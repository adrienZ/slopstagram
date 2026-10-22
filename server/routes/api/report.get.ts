import { defineEventHandler } from "nitro/h3";
import { loadReport } from "../../report-handler.tsx";

export default defineEventHandler(() => ({
  page: "report" as const,
  props: loadReport(),
}));
