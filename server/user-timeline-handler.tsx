import { UserTimelinePage } from "./components/user-timeline-page.tsx";
import { createUserTimeline } from "./user-timeline.ts";

export async function renderUserTimeline(username: string): Promise<globalThis.Response> {
  try {
    const timeline = await createUserTimeline(username);
    if (timeline === null) throw new Error(`no published stories found for ${username}`);

    return UserTimelinePage({ timeline });
  } catch (error) {
    return new globalThis.Response(error instanceof Error ? error.message : String(error), {
      status: 404,
    });
  }
}
