// Deploy: copy plugin to container and test
// Step 1: Copy to host
// scp -i E:/voadge.pem -P 60022 nocobase-plugin-dashboard-home/dist/server/index.js ubuntu@110.42.236.231:/tmp/index.js
// Step 2: Copy into container
// docker cp /tmp/index.js noco-base-app-1:/app/nocobase/packages/plugins/nocobase-plugin-dashboard-home/dist/server/index.js
// Step 3: Restart (if needed - NocoBase hot-reloads plugins in dev mode)
// docker exec noco-base-app-1 pm2 restart nocobase
// Step 4: Test
// docker exec noco-base-app-1 node /app/nocobase/storage/test_submit.js
// docker exec noco-base-app-1 node /app/nocobase/storage/test_port80.js
