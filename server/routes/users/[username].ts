import { defineEventHandler, getRouterParam } from "nitro/h3";
import { renderUserTimeline } from "../../user-timeline-handler.tsx";

export default defineEventHandler((event) =>
  renderUserTimeline(getRouterParam(event, "username") ?? ""),
);
