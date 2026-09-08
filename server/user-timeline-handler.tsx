import { UserTimelinePage } from "./components/user-timeline-page.tsx";
import { createUserTimeline } from "./user-timeline.ts";

export function renderUserTimeline(username: string): globalThis.Response {
  try {
    const timeline = createUserTimeline(username);
    if (timeline === null) {
      throw new Error(`no published stories found for ${username}`);
    }

    return UserTimelinePage({ timeline });
  } catch (error) {
    return new globalThis.Response(error instanceof Error ? error.message : String(error), {
      status: 404,
    });
  }
}
