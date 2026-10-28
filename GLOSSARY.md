# Slopstagram

Slopstagram collects Instagram stories into a rolling story feed and keeps a history
of fetch runs.

## Language

**Story**:
An Instagram story identified independently of the reports in which it appears.
_In code:_ `stories` (`sdk/entities/story.ts`), identified by `mediaPk`; `StoryItem`, `StoryRow`; `StoryRepository` (`sdk/repositories/story-repository.ts`). Publication time is `takenAt`.

**Story data**:
The latest known information about a story, shared across reports.
_In code:_ `stories`, `storyImageVersions`, `storyVideoVersions`, `storyStickers`, `storyAudio` and the observation tables; `StoryItem` with `StoryAnnotations`, read with `StoryRepository.findByMediaPk`. Not the raw payload kept in the story cache.

**Story media version**:
One resolution of a story's image or video. The largest image version provides the preview image.
_In code:_ `storyImageVersions`, `storyVideoVersions`; `image_versions2`, `video_versions`; `getLargestVersion` (`sdk/lib/parser-service.ts`).

**Preview image**:
The still image that represents a story, kept as a local JPEG copy. Vision analysis and Apple OCR read it.
_In code:_ `previewImageUrl`, `preview_image_url`, `storyPreviewPathByUrl`; `cacheReportImages` (`sdk/lib/image-cache-service.ts`).

**Accessibility caption**:
Instagram's own text description of a story's media, when Instagram provides one.
_In code:_ `stories.accessibilityCaption`, `ig_caption`, `NO_ACCESSIBILITY_CAPTION`; shown as "Instagram" in the lightbox.

**Sticker**:
An annotation attached to a story, including a location, mention, music, hashtag,
or link.
_In code:_ `storyStickers` (`story_stickers`), `StorySticker`, `StoryStickerSchema`; `story-sticker-location-service.ts`, `story-annotation-service.ts`; UI `server/components/sticker.tsx`, `timeline-stickers.tsx`.

**Sticker occurrence**:
One instance of a sticker on a story. Separate occurrences may have the same kind
and label.
_In code:_ one `storyStickers` row, keyed by `occurrenceId` (Instagram's id is `providerOccurrenceId`).

**Sticker kind**:
The category of a sticker, such as mention, music, hashtag, link, or location.
_In code:_ `storyStickers.kind` (`"mention" | "music" | "hashtag" | "link" | "location"`); `annotationSources`, `StoryRepository.listStickerKinds`.

**Sticker label**:
The readable content of a sticker, without an added kind prefix. Mentions retain
their @, hashtags retain their #, and links retain their full URL.
_In code:_ `storyStickers.label`; `formatStickerLabel` (`server/timeline-stickers.ts`, adds display prefixes); `locationStickerLabel` (`sdk/location-metadata-service.ts`) for location labels (name and address).

**Sticker source**:
The Instagram field a sticker was read from, kept so that a refreshed field replaces only its own stickers.
_In code:_ `storyStickers.source`, `annotationSources` (`story_bloks_stickers`, `story_music_stickers`, `story_hashtags`, …).

**Sticker observation**:
A story's record that one of its stickers refers to a tagged place or a music asset. It may be left unlinked from any sticker occurrence when the association is uncertain.
_In code:_ `storyLocationObservations`, `storyMusicObservations` (`StoryLocationObservation`, `StoryMusicObservation`); `occurrenceId` is the optional occurrence link.

**Tagged place**:
A place referenced by a location sticker. Multiple sticker occurrences can refer
to the same tagged place.
_In code:_ `metadataLocations` (`metadata_location`), `LocationMetadata`, keyed by `instagramPlaceId`; written by `location-metadata-service.ts`, `location-observation-service.ts`. The code says "location" for the record and the sticker kind, and "place" for lookups.

**Place lookup**:
Fetching a tagged place's current information from Instagram by its place
identifier, independently of any story that references it.
_In code:_ `lookUpTaggedPlaces` (`sdk/place-lookup.ts`), `InstagramClient.getPlace`, `StoryRepository.recordPlaceLookup` / `fillTaggedPlace`; ADR 0005.

**Failed place lookup**:
A place lookup that returned no usable place: no place data, an invalid response, a
GraphQL error, a non-OK response, or a thrown error. The place keeps its known values
and records the attempt time and the raw error until a later lookup succeeds.
_In code:_ `metadataLocations.lastLookupAttemptAt`, `lastLookupFailure`; `StoryRepository.recordFailedPlaceLookup`, `boundLookupFailure`.

**Category**:
The type Instagram assigns to a tagged place, such as a bistro or a bridge, kept in
the wording and language Instagram returned.
_In code:_ `metadataLocations.category`; shown on `TimelinePlace.category`.

**Place details**:
Instagram's descriptive information about a tagged place that the map does not
need: its phone number, price range, slug, and linked business account.
_In code:_ `metadataLocationDetails` (`metadata_location_details`), `PlaceDetails`, `planPlaceDetails`.

**Music asset**:
An Instagram audio item referenced by a music sticker. Multiple sticker
occurrences can refer to the same music asset.
_In code:_ `metadataMusic` (`metadata_music`), `MusicMetadata`, keyed by `instagramAudioAssetId`; `music-metadata-service.ts`, `music-observation-service.ts`; `InstagramClient.getMusicAsset`, `enrichCurrentMusicAssets` (`sdk/music-asset-enrichment.ts`).

**Received music media**:
Audio and artwork supplied by Instagram for a music asset. Its availability is
independent of whether the asset's metadata is complete.
_In code:_ `metadataMusic.audioSourceUrl` / `audioCachePath` / `audioState`, `artworkSourceUrl` / `artworkCachePath` / `artworkState` (`mediaStates`); `processMusicMedia`, `processMusicArtwork`, `cacheReceivedAudio` (`sdk/music-media-service.ts`); ADR 0004.

**Music asset audio**:
Audio received for an Instagram music asset, distinct from the soundtrack of an
individual story. It is not necessarily a full original recording.
_In code:_ `metadataMusic.audioCachePath`, `audioDurationMs` (measured) vs `durationMs` (provider's full-song length); `data/cache/audio`; `musicPreview` (`server/music-preview.ts`).

**Story audio**:
The soundtrack of one story. It may contain music, speech, ambient sound, or a
mixture, even when a music sticker identifies an associated song.
_In code:_ `storyAudio` (`story_audio`), `StoryAudio`, `planStoryAudio` (`sdk/story-audio-service.ts`), `dashAudioSource` (`video_dash_manifest`), `processStoryAudio`; `storyAudioPreview`; UI default title "Audio de la story".

**Reel share**:
A story that reshares an Instagram Reel video. Its soundtrack is not collected as
story audio or music asset audio.
_In code:_ `isReelShare`, `product_type: "clips"`, `story_feed_media`. Not the same as a story reel.

**Partial sticker metadata**:
A tagged place or music asset record that lacks information required to map the
place or identify the music asset.
_In code:_ `status: "partial"` from `classifyLocation` / `classifyMusic`; ADR 0001.

**Usable sticker metadata**:
A tagged place with a valid latitude and longitude, or a music asset with its
Instagram audio asset id, title, and artist.
_In code:_ `status: "usable"` from `classifyLocation` / `classifyMusic`; ADR 0001.

**Story feed**:
The combined collection of stories published on Instagram within the last 24 hours,
regardless of which fetch runs observed them.
_In code:_ `createStoryFeed`, `StoryRepository.listActive` (`sdk/story-feed.ts`); page `server/pages/report.tsx`, `loadReport` (`server/report-handler.tsx`), route `/report`; UI "Le fil des stories". The code name `report` is legacy.

**Story day**:
A calendar day in Paris time. The feed can show the stories published on a past
story day.
_In code:_ `getStoryDate`, `STORY_TIME_ZONE` (`sdk/lib/story-date-service.ts`), `createStoryDayFeed`, `StoryRepository.listPublishedBetween`.

**Vision analysis**:
One run of the vision model on one story's preview image, producing a vision
description and OCR text.
_In code:_ `vision` table (`mediaPk`, `model`, `promptHash`, `visual`, `text`); `analyzeImage` (`sdk/lib/vision-analysis-service.ts`), `resolveVisionForReport`, `VisionResult`; model via Ollama (`sdk/ollama.ts`).

**Vision description**:
What a story's preview image shows, excluding any text in it.
_In code:_ `vision.visual`, `VisionResult.visual`; UI "Vision description".

**OCR text**:
The text visible in a story's preview image, as the vision model reads it.
_In code:_ `vision.text`, `VisionResult.text`; UI "Vision OCR".

**Failed vision analysis**:
A vision analysis that produced no usable result. The story keeps no vision
description or OCR text and records the attempt time and the raw error until a
later vision analysis succeeds.
_In code:_ not implemented yet. A failure is only returned as `createFailureResult` (`visual: "vision failed: …"`) and nothing is persisted.

**Apple caption**:
The text Apple Vision reads from a story's preview image. It is a separate source
from the vision analysis.
_In code:_ `appleVision` (`apple_vision`, `caption`), `recognizeAppleCaption` (`sdk/lib/apple-ocr-service.ts`), `resolveAppleCaptionsForReport`; `NO_APPLE_CAPTION`; UI "Apple OCR".

**Account**:
An Instagram user whose stories are collected, identified by its Instagram pk rather
than its username.
_In code:_ `instagramUsers` (`pk`, `username`, `fullName`), `InstagramUserRepository`; the code says "user" or "username".

**User summary**:
A textual synthesis of one account's stories in the current story feed.
_In code:_ `userSummaries` (`sourceHash`, `promptHash`, `instagramUserPk`), `resolveUserSummariesForReport`, `readUserSummaries` (`sdk/user-summary.ts`).

**Account timeline**:
The historical collection of stored stories for one Instagram account, including
stories older than the story feed's 24-hour window.
_In code:_ `createUserTimeline` (`server/user-timeline.ts`), `StoryRepository.listByUsername`, page `server/pages/users/$username.tsx`, handler `server/user-timeline-handler.tsx`; the code says "user timeline".

**Fetch run**:
One attempt to collect stories from Instagram, whether successful or failed,
retained in the database independently of the story feed.
_In code:_ `fetchRuns` (`fetch_runs`; status running/succeeded/partial/failed), `recordFetchRun` (`sdk/fetch-run.ts`), `createReport` (`sdk/report.ts`); hourly bunqueue job `warm-cache` (`runWarmCacheJob`); script `create:report`.

**Tray**:
Instagram's list of accounts that currently have stories, with the ids of their
stories.
_In code:_ `InstagramClient.getTray`, `ReelTrayResponse`, `StoryTrayEntry`.

**Story reel**:
One tray entry: an account's set of active stories as Instagram groups them. Not an
Instagram Reel video.
_In code:_ `reelId`, `StoryManifestReel`, `reportStoryGroups`, `reelsCount`.

**Report**:
The record of one fetch run: the tray as observed, each story's outcome, failures,
and counts.
_In code:_ `StoriesManifestReport` (`manifest`, `output`, `metadata`, `failures`), `fetchStoriesManifest`; `reports`, `reportStoryGroups`, `reportStories`, `reportFailures`; `ReportRepository`. Linked from `fetchRuns.reportKey`.

**Report snapshot**:
The information captured about a story when a particular report was created.
_In code:_ `reportStories` row (`report_stories`; `status`, `mediaType`, `previewImageUrl`, `locations`, `stickers` as JSON text), in memory `StoryManifestItem`.

**Failed story fetch**:
A story listed in the tray whose media could not be retrieved, recorded on the
report with its reason.
_In code:_ `reportFailures`, `StoryFetchFailure`, reasons `request_failed` / `rate_limited` / `missing_from_response`; `reportStories.status = "failed"`; `story-failure-service.ts`, `story-retry-service.ts`.

**Story cache**:
Raw Instagram story payloads kept locally as observed. They are used to enrich
stories already stored, not to build the story feed.
_In code:_ `storiesStorage`, `createStoryStorage`, `data/cache/stories`; ADR 0002.

**Media cache**:
Local copies of Instagram images and audio (preview images, profile pictures, music
artwork, audio) made because Instagram's URLs expire.
_In code:_ `imageCacheStorage` (`data/cache/images`), `audioCacheStorage` (`data/cache/audio`), `cacheReportImages`, `cacheReportAudio`; served by `server/routes/media/[...path].ts`; `mediaStates` (pending, available, unavailable, unsupported, failed).
