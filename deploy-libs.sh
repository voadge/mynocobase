#!/bin/bash
# Deploy local JS libraries and updated HTML files to server
set -e

SSH_KEY="C:\Users\tsong\.ssh\voadge.pem"
SERVER="ubuntu@110.42.236.231"
DASHBOARD_DIR="/opt/noco-base/dashboard"
LOCAL_DIR="$(dirname "$0")"

echo "=== Deploying self-hosted libs & tool pages ==="

# Step 1: Create lib directory on server
echo ">>> Creating lib directory..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo mkdir -p $DASHBOARD_DIR/lib/cmaps $DASHBOARD_DIR/lib/standard_fonts"

# Step 2: Upload JS libraries
echo ">>> Uploading JS libraries..."
for f in tailwind.min.js pdf.min.js pdf.worker.min.js xlsx.full.min.js jspdf.umd.min.js mammoth.browser.min.js; do
  echo "  Uploading $f..."
  ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo tee $DASHBOARD_DIR/lib/$f > /dev/null" < "$LOCAL_DIR/dashboard/lib/$f"
done

# Step 3: Upload cmaps (169 files)
echo ">>> Uploading cmaps ($(ls "$LOCAL_DIR/dashboard/lib/cmaps" | wc -l) files)..."
for f in "$LOCAL_DIR/dashboard/lib/cmaps/"*; do
  name=$(basename "$f")
  ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo tee $DASHBOARD_DIR/lib/cmaps/$name > /dev/null" < "$f"
done

# Step 4: Upload standard_fonts (16 files)
echo ">>> Uploading standard_fonts ($(ls "$LOCAL_DIR/dashboard/lib/standard_fonts" | wc -l) files)..."
for f in "$LOCAL_DIR/dashboard/lib/standard_fonts/"*; do
  name=$(basename "$f")
  ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo tee $DASHBOARD_DIR/lib/standard_fonts/$name > /dev/null" < "$f"
done

# Step 5: Upload updated HTML files (with local paths)
echo ">>> Uploading 行程发票报销助手.html..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo tee $DASHBOARD_DIR/行程发票报销助手.html > /dev/null" < "$LOCAL_DIR/行程发票报销助手.html"

echo ">>> Uploading 智能排版打印助手.html..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo tee $DASHBOARD_DIR/智能排版打印助手.html > /dev/null" < "$LOCAL_DIR/智能排版打印助手.html"

# Step 6: Set permissions
echo ">>> Setting permissions..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "sudo chmod 644 $DASHBOARD_DIR/lib/*.js $DASHBOARD_DIR/lib/cmaps/* $DASHBOARD_DIR/lib/standard_fonts/* $DASHBOARD_DIR/*.html 2>/dev/null; sudo chmod 755 $DASHBOARD_DIR/lib $DASHBOARD_DIR/lib/cmaps $DASHBOARD_DIR/lib/standard_fonts"

# Step 7: Verify
echo ">>> Verifying deployment..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER" "echo 'lib files:' && ls -la $DASHBOARD_DIR/lib/ && echo 'cmaps:' && ls $DASHBOARD_DIR/lib/cmaps/ | wc -l && echo 'standard_fonts:' && ls $DASHBOARD_DIR/lib/standard_fonts/ | wc -l"

echo ""
echo "=== Deployment complete ==="
echo ""
echo "All JS libraries now self-hosted at /dashboard/lib/"
echo "All page resources served locally - no external CDN dependencies"
