# Story sticker ingestion

Implements [#15](https://github.com/adrienZ/slopstagram/issues/15) from
[specification #12](https://github.com/adrienZ/slopstagram/issues/12).

## Sources and order

Story annotations use `story_stickers` for every kind, including locations.
The fixed source order is:

1. `story_bloks_stickers` (mention and location)
2. `story_music_stickers` (music)
3. `story_hashtags` (hashtag)
4. `story_link_stickers` (link)
5. `story_cta` (link)
6. `story_bloks_tappables` (link)
7. `text_post_share_to_ig_story_stickers` (link)
8. `link` (link)
9. `story_locations` (location)

Within each source, keep array order. If one bloks entry supplies both a mention
and a location, emit the mention followed by the location. Preserve equal labels
within and across sources. This order does not represent visual placement.
Migrated unknown-source occurrences precede known sources, retaining their relative
order. Unrecognized stored kinds remain readable and resavable.

## Replacement and cold reads

A valid supplied source replaces only its own contribution. An empty array clears
that contribution. `link` also accepts its existing single-object form. Missing or
null fields preserve saved data. A malformed field, including an invalid member of
an otherwise valid array, preserves the entire prior source contribution and emits
a warning identifying the story and source without logging the raw payload.
Unsupported bloks sticker kinds do not contribute labels for the supported kinds.

`story_sticker_sources` records successfully observed sources, including empty
ones. Normalized `StoryItem.annotations` carries each occurrence's source and the
observed-source list. Saving normalized data preserves that state and occurrence
order; it does not reinterpret it as a raw Instagram observation. The normalized
location list is a projection, while public non-location sticker lists retain
their existing shape.

Unknown historical provenance cannot be reconstructed. One valid observation
must supply every source that can contribute a kind before replacing that kind's
unknown-source rows. Observing sources across separate partial responses does not
satisfy this condition. Null or malformed sources do not count as supplied. Custom
kinds have no complete replacement rule and are retained.

Read/merge/replacement of occurrences and source presence runs in one synchronous
SQLite transaction. Annotation failures roll back that state; existing media and
caption update behavior is unchanged. Fresh report construction and story cache
writes use the merged saved annotations, so partial responses and cold reads expose
the same locations and stickers. Report snapshots remain unchanged by story updates.

## Deployment order

1. Compatibility preparation: merged PR #17 retains stored annotations on cold reads.
2. Additive schema and one-time backfill: merged PR #18 copies legacy locations into
   unified stickers, preserving duplicates. Stop the preceding writer before this
   migration: later writes to the old location table would not be copied again.
3. Deploy this unified runtime after the additive migration. It neither reads nor
   writes `story_locations`; that table remains solely for the separate cleanup PR.
   Do not resume a preceding writer once source provenance is in use.
4. Review and validate the separate Drizzle Kit cleanup migration (#16), then remove
   obsolete storage. There is no second backfill. Never run the old writer after cleanup.

Applying migrations to the working/production database requires separate explicit
approval after reviewing SQL and disposable-copy validation. Starting the app or
report scripts can automatically run migrations; avoid those commands against
production before approval. This implementation uses explicit in-memory databases
for checks and does not migrate production.
