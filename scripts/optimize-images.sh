#!/bin/bash
# Compress uploaded images for faster loading
set -e
UPLOAD_DIR="/opt/noco-base/storage/uploads"
LOG_FILE="/opt/noco-base/storage/logs/compress.log"
MIN_SIZE=$((200 * 1024))
QUALITY=85
MIN_MTIME_AGE=300

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting image compression..." >> "$LOG_FILE"

find "$UPLOAD_DIR" -maxdepth 1 -type f \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) \
  -size +${MIN_SIZE}c \
  -mmin +$((MIN_MTIME_AGE / 60)) \
  -print0 2>/dev/null | while IFS= read -r -d '' f; do
  before=$(stat -c%s "$f" 2>/dev/null)
  ext=$(echo "$f" | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]')

  if [ "$ext" = "jpg" ] || [ "$ext" = "jpeg" ]; then
    jpegoptim --strip-all --max=$QUALITY --quiet "$f" 2>/dev/null
  elif [ "$ext" = "png" ]; then
    pngquant --quality=60-$QUALITY --force --skip-if-larger --output "$f" "$f" 2>/dev/null || true
    optipng -quiet "$f" 2>/dev/null || true
  fi

  after=$(stat -c%s "$f" 2>/dev/null)
  if [ "$before" -gt "$after" ] 2>/dev/null; then
    pct=$(( (before - after) * 100 / before ))
    echo "  OK $pct% $(basename "$f")" >> "$LOG_FILE"
  fi
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Complete" >> "$LOG_FILE"
