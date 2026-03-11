## Docker Compose Setup
Modify `config.env`, and run Portainer:
```sh
source config.env
docker compose -f portainer.yml up
```

To force restart a container:
```sh
docker compose -f my_compose.yml up --force-recreate my_container
```

To clearly see service status:
```sh
docker compose -f my_compose.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
```

## Disk Server
```sh
docker compose -f disk_server.yml up --remove-orphans
```

Web UI:
```sh
echo https://${SEAWEED_HOST0}:9443 Portainer
echo http://${SEAWEED_HOST0}:9333 SeaweedFS Master
echo http://${SEAWEED_HOST0}:8888 SeaweedFS Bucket Filer
```

Test S3:
```sh
aws s3 --endpoint-url http://${SEAWEED_HOST0}:8333 mb s3://test-bucket
aws s3 --endpoint-url http://${SEAWEED_HOST0}:8333 cp ~/.bashrc s3://test-bucket
aws s3 --endpoint-url http://${SEAWEED_HOST0}:8333 ls s3://test-bucket
aws s3 --endpoint-url http://${SEAWEED_HOST0}:8333 rb s3://test-bucket
```

Test WireGuard:
```sh
./app/wg_customized/connect.sh yetiarch tk
docker exec wg_client ip addr
docker exec wg_client wg show
docker exec wg_client ping -c 1 10.8.0.2
```

## Sandbox Server
```sh
docker compose -f sandbox_server.yml -p sandbox_user_0 up --remove-orphans
```

Test WireGuard:
```sh
docker exec wg_server ip addr
docker exec wg_server wg show
docker exec wg_server ping -c 1 10.8.0.1
```

Test S3:
```sh
docker exec wg_server curl 10.8.0.1:8333
docker run \
    --network container:wg_server \
    -e AWS_ACCESS_KEY_ID=any -e AWS_SECRET_ACCESS_KEY=any \
    -it amazon/aws-cli s3 --endpoint-url http://10.8.0.1:8333 \
    ls s3://test-bucket
```

Test DB:
```sh
docker exec wg_server nc -zv 10.8.0.1 5432
```

## Swarm Service
Remove stack:
```sh
docker stack rm demo
```

Declare stack:
```sh
docker-compose -f swarm_service.yml build
docker stack deploy --prune --compose-file swarm_service.yml demo --detach=false
```

Update a service from source:
```sh
docker-compose -f swarm_service.yml build && docker service update --force demo_gateway
docker service logs -f demo_gateway
# alternative, use lower-level docker logs discarding the print prefix:
docker logs -f $(docker ps -q --filter "name=gateway")
```

Testing gateway rate limits:
```sh
for i in {1..3}; do curl -sI http://yetiarch/test_conn_limit & done
for i in {1..3}; do curl -sI http://yetiarch/test_rate_limit & done
curl -sI http://yetiarch/test_permission/internal/peek
curl -sI http://yetiarch/test_permission/protected/peek
curl -sI http://yetiarch/test_permission/private
```

Test swarm to backend connection:
```sh
docker run --rm --network proxy_net postgres:18 psql \
    postgresql://$DB_USER:$DB_PASS@wireguard_server:5432/backend_db -c "\dt"
```

Test authentication:
```sh
# login
curl http://localhost/auth/authentication \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"changeme!"}'

# verify
curl http://localhost/auth/authorization \
    -H "Content-Type: application/json" \
    -d '{"token":"xxx"}'
```
alternatively, use your browser to visit the test UI interface `http://yourhost/auth-test/private`.

## File Browser
```sh
ROOT=`pwd` PAGE_LIMIT=10 node server.js
docker run -it --rm -p 9980:9980 -e "extra_params=--o:ssl.enable=false" --name collabora_wopi collabora/code
VITE_BACKEND_URL=http://yetiarch:8971 VITE_WOPI_SERVER_URL=http://192.168.232.115:9980 npm run dev
```
