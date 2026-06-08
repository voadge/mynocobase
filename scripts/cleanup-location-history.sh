#!/bin/bash
# cleanup-location-history.sh — 每日清理30天前的 location_history 数据
# 由 cron 调度，每日 03:00 执行

/usr/bin/docker exec -e PGPASSWORD=nocobase123 noco-base-app-1 psql -h postgres -U nocobase -d nocobase -c "
DELETE FROM location_history WHERE recorded_at < NOW() - INTERVAL '30 days';
REINDEX INDEX idx_lh_user_time_valid;
REINDEX INDEX idx_lh_recorded_at;
VACUUM ANALYZE location_history;
" 2>&1 | grep -v 'NOTICE\|REINDEX\|VACUUM'
