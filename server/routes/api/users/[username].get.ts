import { defineEventHandler, getRouterParam } from "nitro/h3";
import { loadUserTimeline } from "../../../user-timeline-handler.tsx";

export default defineEventHandler((event) => ({
  page: "timeline" as const,
  props: loadUserTimeline(getRouterParam(event, "username") ?? ""),
}));
