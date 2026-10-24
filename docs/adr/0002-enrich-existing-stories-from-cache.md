# Enrich existing stories from cached Instagram observations

Metadata backfill will inspect the raw Instagram fields in the story cache and
enrich only stories already present in the database, without recreating absent
stories or changing existing media, ownership, or sticker labels. It will use a
dedicated, rerunnable enrichment operation rather than replay normal story saves,
because cached annotations can override raw extraction and normal saves can replace
unrelated story data; the operation will report enriched and skipped items.

When cached metadata cannot be associated with an existing sticker occurrence with
certainty, leave that occurrence unlinked and report it in the backfill results.
Similar or identical labels alone do not establish an occurrence's identity.
