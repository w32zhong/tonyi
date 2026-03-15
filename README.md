## Docker Compose Setup
Modify `config.env`, and run Portainer (modify DOCKER_SOCK as needed):
```sh
source config.env
DOCKER_SOCK=$XDG_RUNTIME_DIR/docker.sock docker compose -f portainer.yml up --remove-orphans
```

Some commonly used docker-compose commands to look up here:
```sh
docker ps --format 'table {{.Names}} \t {{.Status}}'
docker compose -f my_compose.yml up --force-recreate my_container
docker compose -f my_compose.yml build
docker stack deploy --prune --compose-file my_compose.yml my_project --detach=false
docker service update --force my_project_my_container
```

## Client Services (Storage Providers)
Before hosting a client service, double check if an existing one is running.
All client services will share a host disk mount point at `./mnt`.

To nuke existing host, assuming all running containers are targeted:
```sh
docker stop $(docker ps -q)
docker container prune -f
docker volume prune -f
docker network prune -f
sudo rm -rf ./mnt
```

### Database
To start a PostgreSQL database with WireGuard address `10.8.0.1`:
```sh
WG_CLIENT_IP=10.8.0.1 docker compose -f db_client.yml -p db_1 up --remove-orphans
```

```sh
docker exec $(docker ps -qf "name=wireguard_client") ip addr # check WG IP
docker exec $(docker ps -qf "name=wireguard_client") wg show # check WG stats
docker exec $(docker ps -qf "name=wireguard_client") ping -c 1 10.8.x.x # check WG connection
```

Visit http://localhost:5433 for a `pgweb` WebUI.

### S3
Here is an example `.yml` to create a distributed S3 service, including vol8081, vol8082, volmeta in `./mnt`:
```sh
WG_CLIENT_IP=10.8.0.2 docker compose -f s3_client.yml -p s3_2 up --remove-orphans
```
where its WireGuard address is `10.8.0.2`.

Visit http://localhost:8888 for the SeaweedFS Filer WebUI.

Test local or remote S3:
```sh
export S3_ACCESS_KEY_ID=any
export S3_SECRET_ACCESS_KEY=any
export S3_ENDPOINT=http://$(hostname):8333
S3="docker run \
    -e AWS_DEFAULT_REGION=auto \
    -e AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY \
    -it amazon/aws-cli s3 \
    --endpoint-url $S3_ENDPOINT"

$S3 mb s3://test-bucket
$S3 cp --recursive /usr/lib s3://test-bucket
$S3 rm --recursive s3://test-bucket
$S3 rb s3://test-bucket
```

## Sandbox Server
```sh
docker compose -f sandbox_server.yml -p sandbox_user_0 up --remove-orphans
```

Test S3:
```sh
docker exec wg_server curl 10.8.0.1:8333
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
docker service logs -ft demo_gateway
# alternative, use lower-level docker logs discarding the print prefix:
docker logs -ft $(docker ps -q --filter "name=gateway")
```

Testing gateway rate limits:
```sh
for i in {1..3}; do curl -sI http://yetiarch/test_conn_limit & done
for i in {1..3}; do curl -sI http://yetiarch/test_rate_limit & done
curl -sI http://yetiarch/test_permission/internal/peek
curl -sI http://yetiarch/test_permission/protected/peek
curl -sI http://yetiarch/test_permission/private
```

Testing CloudFlare-Gateway Spoof:
```sh
curl -k --resolve your_domain.com:your_ip H "X-Real-IP: 2.2.2.2" -H "CF-Connecting-IP: 1.1.1.1" \
    https://your_domain.com
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
