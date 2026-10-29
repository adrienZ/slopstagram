# Slopstagram

Slopstagram collects Instagram stories into a rolling story feed and keeps a history
of fetch runs.

## Language

**Story**:
An Instagram story identified independently of the reports in which it appears.

**Story data**:
The latest known information about a story, shared across reports.

**Story media version**:
One resolution of a story's image or video. The largest image version provides the preview image.

**Preview image**:
The still image that represents a story, kept as a local JPEG copy. Vision analysis and Apple OCR read it.

**Accessibility caption**:
Instagram's own text description of a story's media, when Instagram provides one.

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

**Sticker source**:
The Instagram field a sticker was read from, kept so that a refreshed field replaces only its own stickers.

**Sticker observation**:
A story's record that one of its stickers refers to a tagged place or a music asset. It may be left unlinked from any sticker occurrence when the association is uncertain.

**Tagged place**:
A place referenced by a location sticker. Multiple sticker occurrences can refer
to the same tagged place.

**Place lookup**:
Fetching a tagged place's current information from Instagram by its place
identifier, independently of any story that references it.

**Failed place lookup**:
A place lookup that returned no usable place: no place data, an invalid response, a
GraphQL error, a non-OK response, or a thrown error. The place keeps its known values
and records the attempt time and the raw error until a later lookup succeeds.

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
Audio and artwork supplied by Instagram for a music asset. Its availability is
independent of whether the asset's metadata is complete.

**Music asset audio**:
Audio received for an Instagram music asset, distinct from the soundtrack of an
individual story. It is not necessarily a full original recording.

**Story audio**:
The soundtrack of one story. It may contain music, speech, ambient sound, or a
mixture, even when a music sticker identifies an associated song.

**Reel share**:
A story that reshares an Instagram Reel video. Its soundtrack is not collected as
story audio or music asset audio.

**Partial sticker metadata**:
A tagged place or music asset record that lacks information required to map the
place or identify the music asset.

**Usable sticker metadata**:
A tagged place with a valid latitude and longitude, or a music asset with its
Instagram audio asset id, title, and artist.

**Story feed**:
The combined collection of stories published on Instagram within the last 24 hours,
regardless of which fetch runs observed them.

**Story day**:
A calendar day in Paris time. The feed can show the stories published on a past
story day.

**Vision analysis**:
One run of the vision model on one story's preview image, producing a vision
description and OCR text.

**Vision description**:
What a story's preview image shows, excluding any text in it.

**OCR text**:
The text visible in a story's preview image, as the vision model reads it.

**Failed vision analysis**:
A vision analysis that produced no usable result. The story keeps no vision
description or OCR text and records the attempt time and the raw error until a
later vision analysis succeeds.

**Apple caption**:
The text Apple Vision reads from a story's preview image. It is a separate source
from the vision analysis.

**Account**:
An Instagram user whose stories are collected, identified by its Instagram pk rather
than its username.

**User summary**:
A textual synthesis of one account's stories in the current story feed.

**Account timeline**:
The historical collection of stored stories for one Instagram account, including
stories older than the story feed's 24-hour window.

**Fetch run**:
One attempt to collect stories from Instagram, whether successful or failed,
retained in the database independently of the story feed.

**Tray**:
Instagram's list of accounts that currently have stories, with the ids of their
stories.

**Story reel**:
One tray entry: an account's set of active stories as Instagram groups them. Not an
Instagram Reel video.

**Report**:
The record of one fetch run: the tray as observed, each story's outcome, failures,
and counts.

**Report snapshot**:
The information captured about a story when a particular report was created.

**Failed story fetch**:
A story listed in the tray whose media could not be retrieved, recorded on the
report with its reason.

**Story cache**:
Raw Instagram story payloads kept locally as observed. They are used to enrich
stories already stored, not to build the story feed.

**Media cache**:
Local copies of Instagram images and audio (preview images, profile pictures, music
artwork, audio) made because Instagram's URLs expire.
