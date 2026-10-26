# Share typed sticker metadata across occurrences

Location and music metadata will live in separate relational tables, with typed
columns and no JSON blobs, and will be shared by sticker occurrences referring to
the same tagged place or music asset. Sharing avoids duplicating place information
and repeatedly caching the same asset's media, while keeping each occurrence
and its existing label formatting unchanged.

Records are shared only when their Instagram place or audio identifiers match;
matching names or matching music titles and artists are insufficient evidence of
identity. Incomplete observations are retained in separate typed partial metadata
tables, with optional metadata fields, rather than admitted to the usable metadata
tables; when the shared provider identifier is unavailable, keep observations
separate rather than risk merging distinct places or recordings.

Location metadata serves the account's map and requires a valid latitude and
longitude pair; the address is optional. A location's existing sticker label remains
available independently of whether the place can be plotted on the map.

Usable music metadata requires the Instagram audio asset identifier, title, and
artist; received audio and artwork remain optional and do not determine
metadata completeness. Preserve the Instagram sticker
identifier separately: observed sticker identifiers differ across occurrences of
the same audio asset and cannot substitute for its shared identity.

New live observations may update known metadata with nonempty values, but absent or
empty fields never erase known values. Backfill from older cache entries only fills
missing fields, so replaying historical observations cannot replace newer metadata.

When a normal ingestion or backfill provides the missing required information and
the association is certain, automatically promote the partial observation into
usable metadata, preserving its established occurrence links and removing the
superseded partial entry. Promotion does not trigger additional Instagram requests
and does not change sticker labels.
