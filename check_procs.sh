#!/bin/bash
sudo docker exec noco-base_app_1 sh -c '
for pid in $(ls /proc/ | grep -E "^[0-9]+$"); do
  cmd=$(cat /proc/$pid/cmdline 2>/dev/null | tr "\0" " ")
  if [ -n "$cmd" ]; then
    echo "PID $pid: $cmd"
  fi
done 2>/dev/null | head -30
'