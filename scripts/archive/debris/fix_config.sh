#!/bin/bash
# Fix nocobase.conf by removing leftover test blocks
CONF=/opt/noco-base/storage/nocobase.conf

# Remove everything from the last "}" (closing of server block) onwards
# Find the line number of the server block closing brace
LAST_BRACE=$(grep -n "^}$" "$CONF" | tail -1 | cut -d: -f1)
echo "Last closing brace at line $LAST_BRACE"

# Delete all lines after the last closing brace
if [ -n "$LAST_BRACE" ]; then
  sed -i "$LAST_BRACE,\$ { /^}$/{p; d}; d}" "$CONF"
  echo "Deleted content after line $LAST_BRACE"
fi

# Remove any remaining test blocks (lines starting with "    location = /__test")
grep -n "__test" "$CONF" && (sed -i "/__test/,/^    }/d" "$CONF"; echo "Removed test blocks") || echo "No test blocks found"

tail -10 "$CONF"
echo "=== Config length: $(wc -l < "$CONF") lines ==="