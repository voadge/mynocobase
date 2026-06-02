#!/bin/bash
# Deploy updated 10-dashboard.sh to server
ssh -o StrictHostKeyChecking=no -i "C:\Users\tsong\.ssh\voadge.pem" ubuntu@110.42.236.231 'sudo tee /opt/noco-base/storage/scripts/10-dashboard.sh > /dev/null' < E:\my-project\10-dashboard.sh
# Make executable
ssh -o StrictHostKeyChecking=no -i "C:\Users\tsong\.ssh\voadge.pem" ubuntu@110.42.236.231 'sudo chmod +x /opt/noco-base/storage/scripts/10-dashboard.sh'
# Run it inside app container
ssh -o StrictHostKeyChecking=no -i "C:\Users\tsong\.ssh\voadge.pem" ubuntu@110.42.236.231 'sudo docker exec noco-base_app_1 /opt/noco-base/storage/scripts/10-dashboard.sh'
echo "Deployed and ran"