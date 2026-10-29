/** What the report page asks for: an optional day and an optional story to deep link to. */
export interface ReportQuery {
  date?: string;
  story?: string;
}

/**
 * Loads the story feed page data. A plain function that needs no framework runtime,
 * so tests can call it over a database without the Start server function transport.
 * The handler is imported lazily to keep the server-only database code out of client bundles.
 */
export async function fetchReport(query: ReportQuery, now: Date = new Date()) {
  const { loadReport } = await import("./report-handler.tsx");
  return loadReport(now, query.date, query.story);
}
