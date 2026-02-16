FROM openresty/openresty:1.27.1.2-11-bullseye-fat

WORKDIR /root

# install Lua/openresty dependencies
RUN opm install ledgetech/lua-resty-http
RUN opm install SkyLothar/lua-resty-jwt
RUN opm install knyar/nginx-lua-prometheus

# setup LetsEncrypt
RUN apt update && apt install -y ca-certificates wget cron
RUN wget https://get.acme.sh -O ./acme.sh \
    && chmod +x acme.sh && ./acme.sh && rm acme.sh # installed to ~/.acme.sh

# setup nginx environment
COPY . .
RUN mkdir -p logs/ http_root/

CMD ./entrypoint.sh
