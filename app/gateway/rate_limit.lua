local limit_req = require "resty.limit.req"
local limit_conn = require "resty.limit.conn"

limiters = {}

local function get_req_limiter(store_name, rate, burst)
    local cache_key = store_name .. ":" .. rate .. ":" .. burst
    if not limiters[cache_key] then
        local lim, err = limit_req.new(store_name, rate, burst)
        if not lim then
            ngx.log(ngx.ERR, "failed to instantiate a resty.limit.req object: ", err)
            return ngx.exit(500)
        end
        limiters[cache_key] = lim
    end
    return limiters[cache_key]
end

local function get_conn_limiter(store_name, conn, burst, delay)
    local cache_key = store_name .. ":" .. conn .. ":" .. burst .. ":" .. delay
    if not limiters[cache_key] then
        local lim, err = limit_conn.new(store_name, conn, burst, delay)
        if not lim then
            ngx.log(ngx.ERR, "failed to instantiate a resty.limit.conn object: ", err)
            return ngx.exit(500)
        end
        limiters[cache_key] = lim
    end
    return limiters[cache_key]
end

local function rate_limit(route, conn_max, req_rate, req_burst)
    local limit_key = route .. ":" .. (ngx.var.http_x_real_ip or ngx.var.remote_addr)
    print('key=', limit_key, ', conn=', conn_max, ', rate=', req_rate, ', burst=', req_burst)

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
end

-- Apply default rate limits
rate_limit('__all__', default_conn_max, default_req_rate, default_burst)
