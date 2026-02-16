#!/bin/bash
DOMAIN="$1"

set -m # Enable bkgd job control

set -x
nginx -p `pwd`/http_root -c ./nginx.conf -g 'daemon off;' &
sleep 3 # ensure nginx is ready for the LetsEncrypt challenge
set +x

fg
