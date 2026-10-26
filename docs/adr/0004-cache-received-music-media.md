# Cache received Instagram audio with explicit provenance

Instagram-provided audio meets the playback need without a Spotify catalog
dependency. The 2026-10-26 decision drops artwork retrieval and display. Preserve
received URLs as expiring sources and serve successful local copies; availability
does not establish metadata completeness or an occurrence association.

Prefer `progressive_download_url` over `fast_start_progressive_download_url` for
music-asset audio. Current web responses can instead provide a complete audio-only
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
job. The dedicated workload proposed in #42 was closed as not planned. No additional Instagram requests
refresh expired sources. Historical backfill remains a temporary local one-time
operation rather than retained feature code.
