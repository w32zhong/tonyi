#!/bin/bash
set -e
usage() {
    echo "Usage: $0 <REMOTE_USER> <REMOTE_IP> [REMOTE_CONTAINER] [LOCAL_CONTAINER] [SSH]"
    exit 1
}

if [ -z "$1" ]; then usage; fi

REMOTE_USER=$1
REMOTE_IP=$2
REMOTE_CONTAINER=${3:-wg_server}
LOCAL_CONTAINER=${4:-wg_client}
SSH=${5:-"ssh -o ConnectTimeout=5"}
WG_NET="10.8.0.0/16"

echo "⏳ establishing wg tunnel to ${REMOTE_USER}@${REMOTE_IP} ..."
echo "🚃 Using ssh command: $SSH"

LOCAL_PUBKEY=$(docker exec "${LOCAL_CONTAINER}" wg show wg0 public-key)
REMOTE_PUBKEY=$($SSH "${REMOTE_USER}@${REMOTE_IP}" \
    "docker exec ${REMOTE_CONTAINER} wg show wg0 public-key")
echo "🔑 Remote pubkey: $REMOTE_PUBKEY"

docker exec "${LOCAL_CONTAINER}" wg set wg0 \
    peer "${REMOTE_PUBKEY}" \
    endpoint "${REMOTE_IP}:51820" \
    allowed-ips "${WG_NET}" \
    persistent-keepalive 25
docker exec "${LOCAL_CONTAINER}" bash -c "wg showconf wg0 > /config/wg_confs/wg0.conf"

$SSH "${REMOTE_USER}@${REMOTE_IP}" \
    "docker exec ${REMOTE_CONTAINER} wg set wg0 peer ${LOCAL_PUBKEY} allowed-ips ${WG_NET}"
$SSH "${REMOTE_USER}@${REMOTE_IP}" \
    "docker exec ${REMOTE_CONTAINER} bash -c 'wg showconf wg0 > /config/wg_confs/wg0.conf'"

echo "✅ established wg tunnel to ${REMOTE_IP} ..."
