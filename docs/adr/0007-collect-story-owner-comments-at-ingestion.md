# Collect story owner comments at ingestion

Owner comments will be collected while a story is ingested and stored in their own
table, not recovered later from the story cache. Instagram answers the comments
endpoint only for live stories, and the reels-media payload may omit a comment that
the endpoint returns, so the cache cannot be a reliable source. Ingestion reads the
comments inline when the payload has them and asks the comments endpoint otherwise.
A failed or rate-limited lookup never fails a fetch run.

This does not contradict [ADR 0002](0002-enrich-existing-stories-from-cache.md),
which enriches stories already stored from cached observations: owner comments are
new data, not an enrichment, and expired stories cannot be backfilled.

Design and evidence: [feature design](../story-owner-comment-design.md) and
[post-analysis](../story-owner-comment-post-analysis.md).
