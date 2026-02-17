## Docker Compose Setup
Modify `config.env`, and run Portainer:
```sh
source config.env
docker compose -f portainer-standalone.yml up
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
```

Test WireGuard:
```sh
./app/wg_customized/connect.sh yetiarch tk
docker exec wg_client ip addr
docker exec wg_client wg show
docker exec wg_client ping -c 1 10.8.0.2
```

## Sandbox Server
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

## Backend Server
Test:
```sh
curl -X POST http://yetiarch:8001/hello -H "Content-Type: application/json" -d '{"name": "Leo", "age": "18"}'
```

For local development when it requires a browser visiting localhost with HTTPS-only functionalities
but the localhost does not have a browser, set up an SSH tunnel:
```sh
ssh -N -L 3001:localhost:3001 -L 3002:localhost:3002 user@remotehost
```

## Swarm Service
Declare stack:
```sh
docker-compose -f swarm_service.yml build
docker stack deploy --compose-file swarm_service.yml demo --detach=false --resolve-image=never
```

Update a service from source:
```sh
docker-compose -f swarm_service.yml build && docker service update --force demo_gateway
docker service logs -f demo_gateway
curl -4 -X POST localhost/foo/bar -d '{"key":"value"}' --header "Content-Type: application/json"
```
