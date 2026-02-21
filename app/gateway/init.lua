-- Global jariables (used by nginx.conf and rewrite.lua)
_G.default_conn_max = (tonumber(os.getenv("DEFAULT_CONN_MAX")) or 1) -- default concurrent requests
_G.default_req_rate = (tonumber(os.getenv("DEFAULT_REQ_RATE")) or 3) -- default rate limit (req/sec)
_G.default_burst    = (tonumber(os.getenv("DEFAULT_BURST")) or 0)    -- default rate burst (req/sec)
_G.rate_limit = require("rate_limit").rate_limit
_G.cjson = require("cjson")

-- Service discovery
local http = require("resty.http")

function http_get(url)
    local httpc = http.new()
    local data = ''
    httpc:set_timeout(6000) -- 6s timeout

    local res, err = httpc:request_uri(url)

    if not err then
        data = res.body
    end

    httpc:close()
    return data, err
end

function unixsock_get(unix_socket, path)
    local http_resp, data = ''
    local httpc = http.new()
    httpc:set_timeout(6000) -- 6s timeout

    local ok, err = httpc:connect(unix_socket)

    if not ok then
        print('~~ httpc:connect err: ' .. err .. ' ~~')
        goto skip
    end

    http_resp, err = httpc:request({
        method = "GET",
        path = path,
        headers = {
            ["Host"] = "127.0.0.1",
        }
    })

    if err then
        print('~~ httpc:request err: ' .. err .. ' ~~')
        goto skip
    end

    data = http_resp:read_body()

::skip::
    httpc:close()
    return data, err
end

local function discover_services()
    local json, err = unixsock_get('unix:/var/run/docker.sock', '/services')
    if err then
        print('~~ sock:connect err: ' .. err .. ' ~~')
    end

    local services = cjson.decode(json)
    local new_route_map = {}

    for _, service in ipairs(services) do
        -- Parse Docker services API
        local Spec = service['Spec']
        local Labels = Spec['Labels']
        local service_name = Spec['Name']
        local protect_paths, internal_paths, gateway_route, service_port, gateway_limits
        for key in pairs(Labels) do
            local val = Labels[key]
            if key == 'gateway.protect' then
                -- val is a string of paths with comma as delimiter
                -- e.g., "/runjob,/delejob".
                protect_paths = val
            elseif key == 'gateway.internal' then
                internal_paths = val
            elseif key == 'gateway.route' then
                gateway_route = val
            elseif key == 'gateway.port' then
                service_port = val
            elseif key == 'gateway.limits' then
                gateway_limits = cjson.decode(val)
            end
        end

        -- Update new_route_map
        if gateway_route and service_port then
            -- Get route meta data
            if not new_route_map[gateway_route] then
                new_route_map[gateway_route] = {}
            end
            local route_meta = new_route_map[gateway_route]

            -- Set service name
            if not route_meta['services'] then
                route_meta['services'] = {service_name}
            else -- multiple load-balancing services
                table.insert(route_meta['services'], service_name)
            end

            -- Set service port
            route_meta['port'] = service_port

            -- Set gateway limit
            route_meta['rate'] = (gateway_limits and gateway_limits.rate) or default_req_rate
            route_meta['burst'] = (gateway_limits and gateway_limits.burst) or default_burst
            route_meta['conn'] = (gateway_limits and gateway_limits.conn) or default_conn_max

            -- Any protected path(s)?
            if protect_paths then
                -- Let's split the protect paths
                for path in string.gmatch(protect_paths, "[^,]+") do
                    local protected_path = gateway_route .. path
                    ngx.shared.protected:set(protected_path, 'jwt')
                end
            end

            -- Any internal path(s)?
            if internal_paths then
                for path in string.gmatch(internal_paths, "[^,]+") do
                    local internal_path = gateway_route .. path
                    ngx.shared.protected:set(internal_path, 'internal')
                end
            end
        end
    end -- End of for

    -- Update global route map using new_route_map
    for gateway_route, route_meta in pairs(new_route_map) do
        local route_meta_str = cjson.encode(route_meta)
        print('[service] /', gateway_route, ' -> ', route_meta_str)
        ngx.shared.route_map:set(gateway_route, route_meta_str, expire_seconds)
    end
    print('=== SERVICE LIST REFRESHED ===')
end

-- JWT secret update
local function update_jwt_secret()
    local jwt_secret_url = os.getenv("JWT_SECRET_URL") or "jwt_secret"
    local jwt_token, err = http_get('http://' .. jwt_secret_url)
    if not err then
        ngx.shared.JWT:set('secret', jwt_token)
        local partial = (jwt_token or ""):sub(1, 5)
        print('[JWT] secret loaded: ', partial, '...')
    else
        print('[JWT] secret unavailable: ', err)
    end
end

-- refresh reguarly
local interval = 20 -- timer interval (in seconds)
local expire_seconds = interval * 6

local function regular_tasks()
    discover_services()
    update_jwt_secret()
end

ngx.timer.at(0, regular_tasks)
ngx.timer.every(interval, regular_tasks)

-- Prometheus metrics
prometheus = require("prometheus").init("metrics")
metric_request_uri = prometheus:counter("request_uri", "Request URI", {"uri", "status"})
metric_response_bytes = prometheus:counter("response_bytes", "Response Bytes", {"uri"})
metric_request_timecost = prometheus:counter("request_timecost", "Request Timecost", {"uri"})
metric_connections = prometheus:gauge("connections", "Number of HTTP connections", {"state"})
