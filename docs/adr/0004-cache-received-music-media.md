# Cache received Instagram audio with explicit provenance

Instagram-provided audio meets the playback need without a Spotify catalog
dependency. The initial 2026-10-26 decision dropped artwork retrieval and display.
The subsequent request restores display of artwork already cached for the same
music asset, alongside its playable audio. Missing or broken artwork stays hidden;
do not borrow another asset's cover or display remote source URLs. During ingestion, look up known music asset IDs via Instagram’s authenticated
`clips/music/` endpoint, validate the returned asset ID, and cache received audio
and artwork. Preserve received URLs as expiring sources and serve successful local copies; availability
does not establish metadata completeness or an occurrence association.

Prefer `progressive_download_url` over `fast_start_progressive_download_url` for
music-asset audio. Verify that a `video/mp4` asset response contains audio and no
video track before caching it as audio. Current web responses can instead provide a complete audio-only
MP4 rendition inside `video_dash_manifest`; this XML is already in the story
response and requires no extra Instagram metadata request. Fetch its received CDN
source to obtain the bytes.

Music-asset audio can be shared by exact asset identity. DASH soundtracks belong
to individual stories and live in typed story-owned fields, never shared asset
audio fields or stored XML/JSON blobs. Preserve their provenance while displaying
the received song title/artist in the player; use **Audio de la story** only when
no song name is known. The player tooltip retains the story-audio origin. A music sticker, MIME type, or codec cannot prove
music-only acoustic content. Keep that distinction unknown without a separately
defined analysis, and respect explicit received mute flags.

Live observations can refresh URLs; historical cache enrichment fills missing
sources only. Reuse successful files and publish downloads atomically inside the
existing media cache. Current report enrichment invokes the shared processor
after story persistence, already invoked by the existing hourly bunqueue report
job. The dedicated workload proposed in #42 was closed as not planned. Lookup
uses the already-open session, deduplicates IDs per fetch, and stops on rate
limits or authentication failures. It only applies to stories in the current
report, never guesses an asset ID from a title or sticker ID, and never reads
`original_sound_info`. Historical backfill remains a temporary local one-time
operation rather than retained feature code.

Show the player only when a local audio file is available; missing or failed audio
keeps the sticker badge without a player. Cached artwork forms the play control's
disc and rotates only while playing; overflowing titles scroll within the panel
using a native marquee.

Exclude soundtracks of reels and stories that reshare reels, identified by the
received `product_type: clips`. Do not recover `original_sound_info` audio from
reel music pages. Preserve the story and sticker metadata independently.

Persist the measured duration of each cached audio file separately from the
provider's full-song duration. Render it immediately in profile cards and story
details without preloading audio. Request browser media metadata only when the
stored playback duration is missing. Sparse updates and
partial promotion preserve the cached file's measured duration.

For legacy display only, a sticker and a unique same-story asset with exactly
matching normalized title and artist may share one panel. This does not create an
occurrence link or merge metadata identities; the identifier rules in ADRs 0001
and 0002 still apply to persistence. Preserve genuine repeated occurrences and
leave multiple matching assets ambiguous.
