local route = ngx.var.service_route

------------------
--- Rate Limit ---
------------------
local limit_req = require "resty.limit.req"
local limit_conn = require "resty.limit.conn"

local req_limiters = {}
local conn_limiters = {}

-- Example: limiting the requests under 200 req/sec with a burst of 100 req/sec:
-- meaning, we delay requests under 300 req/sec and above 200 req/sec, and reject
-- any requests exceeding 300 req/sec.
local function get_req_limiter(store_name, rate, burst)
    local cache_key = store_name .. ":" .. rate .. ":" .. burst
    if not req_limiters[cache_key] then
        local lim, err = limit_req.new(store_name, rate, burst)
        if not lim then
            ngx.log(ngx.ERR, "failed to instantiate a resty.limit.req object: ", err)
            return ngx.exit(500)
        end
        req_limiters[cache_key] = lim
    end
    return req_limiters[cache_key]
end

-- Example: limit the requests under 200 concurrent requests with
-- a burst of 100 extra concurrent requests, with a default delay of 0.5:
-- meaning, we delay 0.5s for requests under 300 concurrent connections
-- and above 200 connections, and reject extra requests exceeding 300 connections.
local function get_conn_limiter(store_name, conn, burst, delay)
    local cache_key = store_name .. ":" .. conn .. ":" .. burst .. ":" .. delay
    if not conn_limiters[cache_key] then
        local lim, err = limit_conn.new(store_name, conn, burst, delay)
        if not lim then
            ngx.log(ngx.ERR, "failed to instantiate a resty.limit.conn object: ", err)
            return ngx.exit(500)
        end
        conn_limiters[cache_key] = lim
    end
    return conn_limiters[cache_key]
end

local function rate_limit(route, conn_max, req_rate, req_burst)
    local limit_key = route .. ":" .. (ngx.var.http_x_real_ip or ngx.var.remote_addr)
    print('key=', limit_key, ', conn=', conn_max, ', rate=', req_rate)

    local lim_req = get_req_limiter("req_store", req_rate, req_burst)

    local delay_req, err_req = lim_req:incoming(limit_key, true)
    if not delay_req then
        if err_req == "rejected" then
            return ngx.exit(429) -- Too Many Requests
        end
        ngx.log(ngx.ERR, "failed to limit req: ", err_req)
        return ngx.exit(500)
    end

    if delay_req >= 0.001 then
        ngx.sleep(delay_req)
    end

    local conn_burst = 0
    local lim_conn = get_conn_limiter("conn_store", conn_max, conn_burst, 0.5)

    local delay_conn, err_conn = lim_conn:incoming(limit_key, true)
    if not delay_conn then
        if err_conn == "rejected" then
            return ngx.exit(503) -- Service Unavailable
        end
        ngx.log(ngx.ERR, "failed to limit conn: ", err_conn)
        return ngx.exit(500)
    end

    -- to avoid double leaving
    if lim_conn:is_committed() then
        local ctx = ngx.ctx
        ctx.limit_conn = lim_conn
        ctx.limit_conn_key = limit_key
        ctx.limit_conn_delay = delay_conn
    end

    --if delay_conn >= 0.001 then
    --    ngx.sleep(delay_conn)
    --end
end

------------------
--- Rewrite ------
------------------
local modified_uri = ngx.var.modified_uri
local query_params = ngx.var.is_args .. (ngx.var.args or '')
local full_req_uri = ngx.var.request_uri

-- Anything /non_root will be redirected to /non_root/
-- to ensure correct relative path for micro-services.
if route ~= '_root_' and modified_uri == '' then
    ngx.redirect('/' .. route .. '/' .. query_params)
end

local function round_robin(route, route_meta)
    local services = route_meta['services']
    local service_port = route_meta['port']

    local last_rrb = ngx.shared.route_rrb:get(route)
    if not last_rrb then
        last_rrb = 0
    end

    local curr_rrb = (last_rrb + 1) % #services
    ngx.shared.route_rrb:set(route, curr_rrb)
    return services[curr_rrb + 1] .. ':' .. service_port
end

local route_meta_str = ngx.shared.route_map:get(route)
if route_meta_str then
    local route_meta = cjson.decode(route_meta_str)
    rate_limit(route, route_meta.conn, route_meta.rate, route_meta.burst)
    ngx.var.service_addr = round_robin(route, route_meta)
else
    rate_limit(route, default_conn_max, default_req_rate, default_burst)
    print('[route] service for "', route, '" not found, '..
        'fallback to the root.')

    local root_meta_str = ngx.shared.route_map:get('_root_')
    if not root_meta_str then
        -- No micro-service for 404 route, use built-in page.
        ngx.status = ngx.HTTP_NOT_FOUND
        ngx.header.content_type = 'text/html; charset=utf-8'
        ngx.print([[
        <h2>404 Page not found</h2>
        <p>Please check out later if you keep seeing this.</p>
        ]])
        ngx.exit(ngx.HTTP_OK)
    else
        -- Pass to the _root_ service
        local root_meta = cjson.decode(root_meta_str)
        ngx.var.service_addr = round_robin('_root_', root_meta)
        ngx.var.modified_uri = full_req_uri
    end
end

------------------
--- JWT verify ---
------------------
local jwt = require "resty.jwt"
local validators = require "resty.jwt-validators"
local sub_route = string.match(modified_uri, '[^/]+') or ''
for _, test_path in pairs({route .. '/', route .. '/' .. sub_route}) do
    local protected = ngx.shared.protected:get(test_path)
    if protected then
        local jwt_secret = ngx.shared.JWT:get('secret')
        local jwt_token = ngx.var.cookie_gatewayjwt
        if jwt_secret and jwt_token then
            local claim_spec = { exp = validators.is_not_expired() }
            local jwt_res = jwt:verify(jwt_secret, jwt_token, claim_spec)
            if jwt_res.valid and jwt_res.verified then
                print('[JWT] verified, will expire@: ', jwt_res.payload.exp)
                break
            else
                print('[JWT] request rejected: ', jwt_res.reason)
            end
        end

        -- Redirect to /login/?next=...
        local qry = ngx.encode_args({["next"] = full_req_uri})
        ngx.redirect("/login/?" .. qry)
    end
end

-- Print final rewriting rule (if no ngx.exit/redirect is called)
print('[route] pass: ', full_req_uri, ' ==> ',
    ngx.var.service_addr, ngx.var.modified_uri, query_params)
