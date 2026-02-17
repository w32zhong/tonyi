local refresh_interval = 20 -- timer interval (in seconds)
local expire_seconds = refresh_interval * 6
default_conn_max = 1 -- default concurrent requests
default_req_rate = 2 -- default rate limit (req/sec)
default_burst = 10   -- default rate burst (req/sec)

cjson = require("cjson") -- global variable (used by rewrite.lua)
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
        local protect_paths, gateway_route, service_port, gateway_limit
        for key in pairs(Labels) do
            local val = Labels[key]
            if key == 'gateway.jwt_port' then
                local jwt_token, err = http_get(
                    'http://' .. service_name .. ':' .. val
                )
                if not err then
                    ngx.shared.JWT:set('secret', jwt_token)
                else
                    print('[JWT] update error: ', err)
                end
            elseif key == 'gateway.protect' then
                -- val is a string of paths with comma as delimiter
                -- e.g., "/runjob,/delejob".
                protect_paths = val
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
            route_meta['burst'] = (gateway_limits and gateway_limits.conn) or default_burst
            route_meta['conn'] = (gateway_limits and gateway_limits.conn) or default_conn_max

            -- Any protected path(s)?
            if protect_paths then
                -- Let's split the protect paths
                for path in string.gmatch(protect_paths, "[^,]+") do
                    local protected_path = gateway_route .. path
                    ngx.shared.protected:set(protected_path, true)
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

ngx.timer.at(0, discover_services)
ngx.timer.every(refresh_interval, discover_services)

-- define prometheus metrics
prometheus = require("prometheus").init("metrics")
metric_request_uri = prometheus:counter("request_uri", "Request URI", {"uri", "status"})
metric_response_bytes = prometheus:counter("response_bytes", "Response Bytes", {"uri"})
metric_request_timecost = prometheus:counter("request_timecost", "Request Timecost", {"uri"})
metric_connections = prometheus:gauge("connections", "Number of HTTP connections", {"state"})
