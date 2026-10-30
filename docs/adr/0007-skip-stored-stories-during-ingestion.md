# Skip stories already stored during ingestion

Right after the tray fetch, a fetch run loads every expected story already present
in the database and counts it as a cache hit. It asks Instagram only for the
reels that still contain a missing story, and it never saves a stored story again,
even when a fetched reel also returns it. The report's cache hits and misses
therefore describe real work saved instead of always reporting zero.

Stored stories are no longer refreshed from Instagram by later fetch runs. A story
that Instagram edits while it is live keeps the annotations first stored. Backfills
that must merge newer observations into stored stories go through the enrichment
operation described in ADR 0002 or a direct repository save, not through a fetch
run.

The file story cache is not read to build the story feed, as the glossary requires.
It is still written for each story fetched from Instagram.
