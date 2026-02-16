local limit_req = require "resty.limit.req"
local limit_conn = require "resty.limit.conn"

local service_rates = {
    ["login"]   = { rate = 1,  burst = 2 },  -- 登录：每秒 1 次，允许 2 个突发
    ["api"]     = { rate = 20, burst = 50 }, -- API：每秒 20 次，允许 50 个突发
    ["static"]  = { rate = 100, burst = 100 }, -- 静态资源：给得很足
    ["default"] = { rate = 10, burst = 20 }  -- 默认配置
}

local service_name = ngx.var.service_route
local config = service_rates[service_name] or service_rates["default"]

-- 3. 初始化限流器
-- 参数：共享内存名, 速率(r/s), 爆发量(burst)
local lim, err = limit_req.new("my_limit_req_store", config.rate, config.burst)
if not lim then
    ngx.log(ngx.ERR, "初始化限流器失败: ", err)
    return -- 或者报错退出
end

local key = ngx.var.binary_remote_addr
local delay, err = lim:incoming(key, true)

if not delay then
    if err == "rejected" then
        ngx.status = 429 -- Too Many Requests
        ngx.say('{"error": "访问太频繁了，请稍后再试"}')
        return ngx.exit(429)
    end
    ngx.log(ngx.ERR, "限流执行出错: ", err)
    return
end

if not delay then
    if err == "rejected" then
        -- 这行就等于 limit_conn_status 503;
        ngx.status = 503
        ngx.say('{"msg": "服务器连接数已满 (Too Many Connections)"}')
        return ngx.exit(503) 
    end
end

-- 5. 处理排队 (delay > 0 表示该请求需要被延迟处理以符合频率限制)
if delay >= 0.001 then
    -- 如果你不想要原生 limit_req 那种 nodelay 的效果
    -- 可以让请求休眠一会儿再往下走
    ngx.sleep(delay)
end


local route = ngx.var.service_route
local modified_uri = ngx.var.modified_uri
local query_params = ngx.var.is_args .. (ngx.var.args or '')
local full_req_uri = ngx.var.request_uri

-- Anything /non_root will be redirected to /non_root/
-- to ensure correct relative path for micro-services.
if route ~= '_root_' and modified_uri == '' then
    ngx.redirect('/' .. route .. '/' .. query_params)
end

-- Handle GeoIP information
local success, geo_info = geo_lookup(ngx.var.remote_addr)
if success then
    ngx.var.geo_city = geo_info.city
    ngx.var.geo_subd = geo_info.region
    ngx.var.geo_ctry = geo_info.country
    ngx.var.geo_longitude = geo_info.longitude
    ngx.var.geo_latitude  = geo_info.latitude
end

-- Handle proxy host rewriting
local function get_service_addr(route, route_meta)
    local services = route_meta['services']
    local service_port = route_meta['port']

    local last_rrb = ngx.shared.route_rrb:get(route)
    if not last_rrb then
        last_rrb = 0
    end

    local curr_rrb = (last_rrb + 1) % #services
    -- print('[route] round robin: ', cjson.encode(services), '@'..curr_rrb)
    ngx.shared.route_rrb:set(route, curr_rrb)
    return services[curr_rrb + 1] .. ':' .. service_port
end

local route_meta_str = ngx.shared.route_map:get(route)
if route_meta_str then
    local route_meta = cjson.decode(route_meta_str)
    -- Output service address for proxy_pass
    ngx.var.service_addr = get_service_addr(route, route_meta)
else
    print('[route] service for "', route, '" not found, '..
        'fall through to the root.')

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
        -- Pass to _root_ service
        local root_meta = cjson.decode(root_meta_str)
        ngx.var.service_addr = get_service_addr('_root_', root_meta)
        ngx.var.modified_uri = full_req_uri
    end
end

-- Handle route JWT verification
local jwt = require "resty.jwt"
local validators = require "resty.jwt-validators"
local sub_route = string.match(modified_uri, '[^/]+') or ''
for _, test_path in pairs({route .. '/', route .. '/' .. sub_route}) do
    local protected = ngx.shared.protected:get(test_path)
    if protected then
        print('[route] ', test_path, ' is under protection.')
        local jwt_secret = ngx.shared.JWT:get('secret')
        local jwt_token = ngx.var.cookie_latticejwt
        local claim_spec = { exp = validators.is_not_expired() }
        if jwt_secret and jwt_token then
            local jwt_res = jwt:verify(jwt_secret, jwt_token, claim_spec)
            if jwt_res.valid and jwt_res.verified then
                print('[JWT] verified, will expire@: ', jwt_res.payload.exp)
                break
            else
                print('[JWT] request rejected: ', jwt_res.reason)
            end
        end

        -- Redirect client to login
        local qry = ngx.encode_args({["next"] = full_req_uri})
        -- ngx.redirect("/lattice/login?" .. qry) -- for DEBUG
        ngx.redirect("/login/?" .. qry) -- for PRODUCTION
    end
end

-- Print final rewriting rule (if no ngx.exit/redirect is called)
print('[route] pass: ', full_req_uri, ' ==> ',
    ngx.var.service_addr, ngx.var.modified_uri, query_params)
