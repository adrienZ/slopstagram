# Look up tagged places on Instagram during ingestion

Story payloads often carry only a place identifier, and never a place's category or
contact details. After a story is saved, ingestion will look up each tagged place it
references that has never been looked up, whose last successful lookup is older than
three months, or whose last failed lookup is older than twelve hours, using the
session's authenticated Instagram location query. Lookups run inline in ingestion, not
in a queue, because place metadata cannot be completed without them. This amends
ADR 0001's rule that completion triggers no additional Instagram requests, for
locations only; music assets are already looked up during ingestion (ADR 0004).

Values from stories win. A lookup fills only the name, address, coordinates, and city
that are still missing and supplies the zip code, while category and place details are
written only by lookups and replaced on refresh. Instagram's place coordinates can
differ from story coordinates by kilometres for large sites, so one fixed precedence
prevents a place from alternating between two positions. A lookup never changes whether
a tagged place is usable, which still depends on a valid latitude and longitude.

A failed lookup, including a response without place data, records the raw error on the
place together with the attempt time and leaves known values untouched. Existing places
are looked up by a one-time, throttled, local backfill rather than by the first
ingestion, so ingestion only looks up places referenced by the stories it just saved.
