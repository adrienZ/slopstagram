import { notFound } from "@tanstack/react-router";

/**
 * Loads an account's timeline page data. A plain function that needs no framework runtime,
 * so tests can call it over a database without the Start server function transport.
 * An account the application has never seen becomes the router's not-found response.
 * The handler is imported lazily to keep the server-only database code out of client bundles.
 */
export async function fetchUserTimeline(username: string, now: Date = new Date()) {
  const { loadUserTimeline } = await import("./user-timeline-handler.tsx");
  try {
    return loadUserTimeline(username, now);
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      notFound({ throw: true });
    }
    throw error;
  }
}
