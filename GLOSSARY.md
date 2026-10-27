# Slopstagram

Slopstagram collects Instagram stories into a rolling story feed and keeps a history
of fetch runs.

## Language

**Story**:
An Instagram story identified independently of the reports in which it appears.

**Sticker**:
An annotation attached to a story, including a location, mention, music, hashtag,
or link.

**Sticker occurrence**:
One instance of a sticker on a story. Separate occurrences may have the same kind
and label.

**Sticker kind**:
The category of a sticker, such as mention, music, hashtag, link, or location.

**Sticker label**:
The readable content of a sticker, without an added kind prefix. Mentions retain
their @, hashtags retain their #, and links retain their full URL.

**Tagged place**:
A place referenced by a location sticker. Multiple sticker occurrences can refer
to the same tagged place.

**Place lookup**:
Fetching a tagged place's current information from Instagram by its place
identifier, independently of any story that references it.

**Failed place lookup**:
A place lookup that returned no usable place: no place data, an invalid response, a
GraphQL error, or a thrown error. The place keeps its known values and records the
attempt time and the raw error until a later lookup succeeds.

**Category**:
The type Instagram assigns to a tagged place, such as a bistro or a bridge, kept in
the wording and language Instagram returned.

**Place details**:
Instagram's descriptive information about a tagged place that the map does not
need: its phone number, price range, slug, and linked business account.

**Music asset**:
An Instagram audio item referenced by a music sticker. Multiple sticker
occurrences can refer to the same music asset.

**Received music media**:
Audio supplied by Instagram for a music asset. Its availability is independent
of whether the asset's metadata is complete.

**Music asset audio**:
Audio received for an Instagram music asset, distinct from the soundtrack of an
individual story. It is not necessarily a full original recording.

**Story audio**:
The soundtrack of one story. It may contain music, speech, ambient sound, or a
mixture, even when a music sticker identifies an associated song.

**Partial sticker metadata**:
An observation that lacks information required to map a tagged place or identify
a music asset.

**Story data**:
The latest known information about a story, shared across reports.

**Story feed**:
The combined collection of stories published on Instagram within the last 24 hours,
regardless of which fetch runs observed them.

**User summary**:
A textual synthesis of one account's stories in the current story feed.

**Fetch run**:
One attempt to collect stories from Instagram, whether successful or failed,
retained in the administrative history independently of the story feed.

**Account timeline**:
The historical collection of stored stories for one Instagram account, including
stories older than the story feed's 24-hour window.

**Report snapshot**:
The information captured about a story when a particular report was created.
