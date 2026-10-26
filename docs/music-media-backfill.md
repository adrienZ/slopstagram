# One-time local music media backfill

Run from the repository root against an initialized database. Start the application
once to apply its normal migrations, then pause ingestion while backing up and
running this operation. The script never runs migrations or requests Instagram.

Create a SQLite backup (including committed WAL data):

```sh
python3 - <<'PY'
import datetime, pathlib, sqlite3
backup = pathlib.Path('data/backups') / ('music-media-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.sqlite')
backup.parent.mkdir(exist_ok=True)
with sqlite3.connect('data/slopstagram.sqlite') as source, sqlite3.connect(backup) as destination:
    source.backup(destination)
backup.chmod(0o600)
print(backup)
PY
node --import tsx scripts/backfill-music-media.ts
```

The operation fills missing audio/artwork sources on existing music metadata only.
It reads raw music fields, ignores cached annotations, preserves newer sources and
all occurrence links, and leaves uncertain anonymous associations untouched. Four
workers attempt received media URLs and reuse existing successful local copies.
Audio and artwork failures are independent; expired sources remain unavailable.
Rerunning is safe but may retry failed downloads. Automatic scheduling/recovery is
tracked separately in #42.

The final line reports cache files inspected, enriched/skipped/uncertain/invalid
entries, and available/unavailable audio and artwork records. No signed URLs or raw
payloads are logged. Keep the backup until the result has been inspected.
