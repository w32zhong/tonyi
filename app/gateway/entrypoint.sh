#!/bin/bash
DOMAIN="$1"

set -m # Enable bkgd job control

set -x
nginx -p /root -c ./nginx.conf -g 'daemon off;' &
sleep 3 # ensure nginx is ready for the LetsEncrypt challenge
set +x

# If DOMAIN env variable is set, setup TLS server.
# Example: DOMAIN=approach0.xyz
if [ -n "$DOMAIN" ]; then
    # Enable TLS in Nginx using /root/cert.pem and /root/key.pem;
    RELOAD_CMD='nginx -p /root -s reload'
    sed -i 's/# UNCOMMENT_THIS//g' ./nginx.conf
    sed -i '/DELETE_THIS/d' ./nginx.conf
    cat ./nginx.conf
    $RELOAD_CMD

    # try to reload an existing real key/cert.pem, install-cert if it's missing.
    set -x
    CERT_DIR='/root/keys'
    UPDATE_CERT="cp $CERT_DIR/key.pem /root; cp $CERT_DIR/cert.pem /root; $RELOAD_CMD"
    if [ -e $CERT_DIR/key.pem ]; then
        echo "Real certificates exist, use them..."
        bash -c "$UPDATE_CERT"

        # regularly renew touch
        crontab <<- EOF
        23 1 * * * /root/.acme.sh/acme.sh --cron --home /root/.acme.sh > /root/logs/acme.log
        *  * * * * date > /root/logs/cron.log
        EOF
    else
        pushd ./.acme.sh
        # Verify and issue certificate
        ./acme.sh --issue -d $DOMAIN -d www.$DOMAIN -w /root --server letsencrypt
        # Generate certificate pem files
        mkdir -p $CERT_DIR
        ./acme.sh --install-cert -d $DOMAIN -d www.$DOMAIN \
            --key-file $CERT_DIR/key.pem \
            --fullchain-file $CERT_DIR/cert.pem \
            --reloadcmd "bash -c '$UPDATE_CERT'"
        popd
    fi

    service cron start
    set +x
    crontab -l

    echo 'To forcely renew certificates:'
    echo ./acme.sh --renew -d $DOMAIN -d www.$DOMAIN --force
fi

fg
