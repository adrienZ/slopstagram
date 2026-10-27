---
status: superseded by ADR-0004
---

# Resolve Spotify matches asynchronously with bunqueue

Usable music metadata, whether received during ingestion or recovered from cache,
will automatically enter a dedicated Spotify matching queue using the project's
existing bunqueue server. Matching is shared by Instagram audio asset identity and
does not block ingestion, so external API latency or failures do not interrupt
story collection or cause repeated searches for each sticker occurrence.

Only reliable matches expose a Spotify button beside the unchanged music label in
the account's music card and expanded dialog. Ambiguous and not-found outcomes
remain without a Spotify link, with no manual selection interface in the first
version; technical failures remain distinct from those outcomes and can be retried.

Superseded on 2026-10-26: the owner chose Instagram-provided audio and artwork
without Spotify credentials or catalog matching. See [ADR 0004](0004-cache-received-music-media.md).
