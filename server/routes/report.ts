import { defineEventHandler } from "nitro/h3";
import { renderReport } from "../report-handler.tsx";

export default defineEventHandler(renderReport);
