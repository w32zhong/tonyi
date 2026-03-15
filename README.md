## Docker Compose Setup
Modify `config.env`, and run Portainer (modify DOCKER_SOCK as needed):
```sh
source config.env
DOCKER_SOCK=$XDG_RUNTIME_DIR/docker.sock docker compose -f portainer.yml up --remove-orphans
```

For root docker, use `.env` to pass environment variables (insecure, testing only!)
```sh
env > .env
sudo OVERWRITE_VAR=overwrite_value docker ...
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

## Public Services
Public service runs on a publicly hosted server.
The server requires docker swarm to be installed:
```sh
docker swarm init
```

### Proxy-Only Service
Create the g-namespace sandbox service with only WireGuard proxy services:
```sh
WG_SERVER_ID=50 \
WG_S3_IP=10.8.0.2 \
docker compose -f sandbox_server.yml -p g up --remove-orphans \
wireguard_server proxy
```
this is used to set up an overlay `g_proxy_net` for a swarm service to talk to client services.

On the client service side, manually establish WireGuard connections via:
```sh
./app/wg_customized/connect.sh REMOTE_USER REMOTE_IP g-wireguard_server-1 db_1-wireguard_client-1
./app/wg_customized/connect.sh REMOTE_USER REMOTE_IP g-wireguard_server-1 s3_2-wireguard_client-1
```

Back to the server side, check the `wg show` and connections:
```sh
docker exec $(docker ps -qf "name=wireguard_server") wg show
docker exec $(docker ps -qf "name=wireguard_server") ping -c 1 10.8.0.1
docker exec $(docker ps -qf "name=wireguard_server") ping -c 1 10.8.0.2
```

One can further test the actual S3 and DB ports:
```sh
docker exec $(docker ps -qf "name=wireguard_server") curl 10.8.0.2:8333   # S3
docker exec $(docker ps -qf "name=wireguard_server") nc -zv 10.8.0.1 5432 # DB
```

### Sandbox Service
A sandbox service should be a namespaced combo of multiple containers: file browser, web browser, agent CLI, and a search engine.
Below are examples to create sandbox services alone.

Create a `sandbox_51` using self-hosted S3:
```sh
WG_SERVER_ID=51 \
WG_S3_IP=10.8.0.2 \
JFS_S3_ENDPOINT=http://wireguard_server:8333 \
JFS_S3_BUCKET_NAME=test-bucket \
JFS_S3_KEY_NAME=sandbox_51
docker compose -f sandbox_server.yml -p sandbox_51 up --remove-orphans
```

Create a `sandbox_52` using 3rd-party S3:
```sh
WG_SERVER_ID=52 \
JFS_S3_ENDPOINT=https://XXXXXX.r2.cloudflarestorage.com \
JFS_S3_BUCKET_NAME=test-bucket \
JFS_S3_KEY_NAME=sandbox_52
docker compose -f sandbox_server.yml -p sandbox_51 up --remove-orphans
```

We can create sandbox services on demand, but be sure to run `connect.sh` to establish establish WireGuard connections for accessing remote S3.

### Swarm Service
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
