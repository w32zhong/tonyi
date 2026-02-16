FROM openresty/openresty:1.27.1.2-11-bullseye-fat

WORKDIR /root
RUN mkdir -p logs/ http_root/

# install Lua/openresty dependencies
RUN opm install ledgetech/lua-resty-http
RUN opm install SkyLothar/lua-resty-jwt
RUN opm install openresty/lua-resty-limit-traffic
RUN opm install knyar/nginx-lua-prometheus

# setup LetsEncrypt, and get ready for the /.well-known/acme-challenge.
RUN apt update && apt install -y ca-certificates wget cron
RUN wget https://get.acme.sh -O ./acme.sh \
    && chmod +x acme.sh && ./acme.sh && rm acme.sh # installed to ~/.acme.sh
RUN D=http_root/.well-known && mkdir $D && echo '<html>test</html>' > $D/test.html
# a self-signed key to bootstrap TLS
RUN openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
    -days 365 -nodes -subj "/C=US/ST=Oregon/L=Portland/O=Linux/OU=Org/CN=www.microsoft.com"

COPY . .
CMD ./entrypoint.sh
