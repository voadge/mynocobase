Add `NODE_MODULES_PATH=/app/nocobase/node_modules` to the app container environment.

Steps:
1. Edit the docker-compose.yml (or similar) to add the env var
2. Or just restart the container with the var added

The quickest approach: restart with the env var set via `docker-compose rm -sf && docker-compose up -d` after adding the env var, OR temporarily just run `docker exec -e NODE_MODULES_PATH=/app/nocobase/node_modules -it noco-base_app_1 ...` to test.

Let's just set it in the docker container config and restart.
