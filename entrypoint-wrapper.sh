#!/bin/sh
# Entrypoint wrapper for NocoBase with Docker Secrets support
# Reads _FILE suffix environment variables and exports as regular env vars

# APP_KEY
if [ -n "$APP_KEY_FILE" ] && [ -f "$APP_KEY_FILE" ]; then
  APP_KEY=$(cat "$APP_KEY_FILE")
  export APP_KEY
fi

# DB_PASSWORD
if [ -n "$DB_PASSWORD_FILE" ] && [ -f "$DB_PASSWORD_FILE" ]; then
  DB_PASSWORD=$(cat "$DB_PASSWORD_FILE")
  export DB_PASSWORD
fi

# REDIS_URL - reconstruct from password file if needed
if [ -n "$REDIS_PASSWORD_FILE" ] && [ -f "$REDIS_PASSWORD_FILE" ]; then
  REDIS_PASSWORD=$(cat "$REDIS_PASSWORD_FILE")
  export REDIS_PASSWORD
  # Reconstruct REDIS_URL if not already set
  if [ -z "$REDIS_URL" ]; then
    REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379/0"
    export REDIS_URL
  fi
fi

exec /app/docker-entrypoint.sh "$@"
