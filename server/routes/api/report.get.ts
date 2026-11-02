import { defineEventHandler } from "nitro/h3";
import { loadReport } from "../../../app/report-handler.tsx";

export default defineEventHandler(() => ({
  page: "report" as const,
  props: loadReport(),
}));
