#!/bin/bash
set -e
UPLOAD_DIR="/opt/noco-base/storage/uploads"
LOG_FILE="/opt/noco-base/storage/logs/transcode.log"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting video transcode..." >> "$LOG_FILE"

find "$UPLOAD_DIR" -maxdepth 1 -iname '*.mp4' -size +1M | while IFS= read -r f; do
  case "$(basename "$f")" in *_opt.mp4) continue;; esac
  before=$(stat -c%s "$f" 2>/dev/null)
  tmp="${f%.*}.tmp.mp4"
  if ffmpeg -y -i "$f" -c:v libx264 -preset medium -crf 28 -vf "scale=720:-2" -c:a aac -b:a 64k -movflags +faststart "$tmp" 2>/dev/null; then
    after=$(stat -c%s "$tmp" 2>/dev/null)
    if [ "$after" -gt 0 ] && [ "$after" -lt "$before" ]; then
      mv "$tmp" "$f"
      pct=$(( (before - after) * 100 / before ))
      echo "  OK $pct% ($(numfmt --to=iec $before) -> $(numfmt --to=iec $after)) $(basename "$f")" >> "$LOG_FILE"
    else
      rm -f "$tmp"
      echo "  SKIP $(basename "$f") (no reduction)" >> "$LOG_FILE"
    fi
  fi
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Complete" >> "$LOG_FILE"
