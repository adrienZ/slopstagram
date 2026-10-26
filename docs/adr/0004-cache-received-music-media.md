# Cache received Instagram music media

Instagram-provided audio and artwork meet the playback need without a Spotify
catalog dependency. Preserve their received URLs as expiring sources and serve
successful local copies; audio and artwork have independent availability and do
not establish metadata completeness or an occurrence association.

Prefer `progressive_download_url` over `fast_start_progressive_download_url`, and
`cover_artwork_uri` over `cover_artwork_thumbnail_uri`, falling back when the
preferred value is missing, empty, or invalid. Live observations can refresh URLs;
historical cache enrichment fills missing sources only. Reuse successful files and
publish downloads atomically inside the existing media cache. The processor is
shared with the later bunqueue workload (#42), which uses the existing server
lifecycle. No additional Instagram requests refresh expired sources.
