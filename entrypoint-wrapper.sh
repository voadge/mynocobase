#!/bin/sh
set -e

if [ -n "$APP_KEY_FILE" ] && [ -f "$APP_KEY_FILE" ]; then
  APP_KEY=$(cat "$APP_KEY_FILE"); export APP_KEY
fi
if [ -n "$DB_PASSWORD_FILE" ] && [ -f "$DB_PASSWORD_FILE" ]; then
  DB_PASSWORD=$(cat "$DB_PASSWORD_FILE"); export DB_PASSWORD
fi
if [ -n "$REDIS_PASSWORD_FILE" ] && [ -f "$REDIS_PASSWORD_FILE" ]; then
  REDIS_PASSWORD=$(cat "$REDIS_PASSWORD_FILE"); export REDIS_PASSWORD
  REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379/0"; export REDIS_URL
fi

if [ $# -eq 0 ]; then
  exec /app/docker-entrypoint.sh
else
  exec /app/docker-entrypoint.sh "$@"
fi
