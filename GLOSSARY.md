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
