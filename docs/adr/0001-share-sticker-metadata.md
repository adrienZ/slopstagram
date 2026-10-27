# Share typed sticker metadata across occurrences

Location and music metadata will live in separate relational tables, with typed
columns and no JSON blobs, and will be shared by sticker occurrences referring to
the same tagged place or music asset. Sharing avoids duplicating place information
and repeatedly caching the same asset's media, while keeping each occurrence
and its existing label formatting unchanged.

Records are shared only when their Instagram place or audio identifiers match;
matching names or matching music titles and artists are insufficient evidence of
identity. Incomplete and usable metadata share one typed table per kind, with
nullable fields; usability is derived from the fields. Present values must satisfy
database checks. When the shared provider identifier is unavailable, keep
observations separate rather than risk merging distinct places or recordings.

Location metadata serves the account's map and requires a valid latitude and
longitude pair; the address is optional. A location's existing sticker label remains
available independently of whether the place can be plotted on the map.

Usable music metadata requires the Instagram audio asset identifier, title, and
artist; received audio remains optional and does not determine
metadata completeness. Preserve the Instagram sticker
identifier separately: observed sticker identifiers differ across occurrences of
the same audio asset and cannot substitute for its shared identity.

New live observations may update known metadata with nonempty values, but absent or
empty fields never erase known values. Backfill from older cache entries only fills
missing fields, so replaying historical observations cannot replace newer metadata.

When a normal ingestion or backfill provides the missing required information and
the association is certain, automatically make the existing metadata usable,
preserving its established occurrence links. If an identified record already exists, reconcile the records
and retain their links. Completion does not trigger additional Instagram requests
and does not change sticker labels.

The original decision used separate partial and usable tables. On 2026-10-27,
they were consolidated to avoid duplicate schemas and relinking during ordinary
completion. During migration, a matching usable record takes precedence, partial
values fill gaps, and invalid present values become missing.
