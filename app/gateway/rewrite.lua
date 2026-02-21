local route = ngx.var.service_route

------------------
--- Rewrite ------
------------------
-- Strip any potential spoofed headers from external requests
ngx.req.clear_header("X-Remote-User")

local modified_uri = ngx.var.modified_uri
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
    -- route-specific rate limits
    rate_limit(route, route_meta.conn, route_meta.rate, route_meta.burst)

    ngx.var.service_addr = round_robin(route, route_meta)

else
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

print(string.format('[route] rewritten: %s => %s', route, ngx.var.modified_uri))

------------------
--- JWT verify ---
------------------
local jwt = require "resty.jwt"
local validators = require "resty.jwt-validators"
local jwt_cookie_name = os.getenv("JWT_COOKIE_NAME") or "jwt"

-- find out the longest prefix match to current path (check_path) from protect keys
local protected_mode = nil
local longest_match = nil
for _, key in ipairs(ngx.shared.protected:get_keys()) do
    -- perform prefix plain (true) match against check_path and key:
    local check_path = route .. modified_uri
    if string.find(check_path, key, 1, true) == 1 then
        -- Find the longest matching prefix (most specific rule wins)
        if not longest_match or string.len(key) > string.len(longest_match) then
            longest_match = key
            protected_mode = ngx.shared.protected:get(key)
        end
    end
end

-- if any, perform block or JWT auth ...
if protected_mode then
    if protected_mode == 'jwt' then
        local jwt_secret = ngx.shared.JWT:get('secret')
        local jwt_token = ngx.var["cookie_" .. jwt_cookie_name]

        local pass = false
        if jwt_secret and jwt_token then
            -- verify signature and check expiration dates
            local claim_spec = { exp = validators.is_not_expired() }
            local jwt_res = jwt:verify(jwt_secret, jwt_token, claim_spec)

            if jwt_res.valid and jwt_res.verified then
                print('[JWT] verified, will expire@: ', jwt_res.payload.exp)
                ngx.req.set_header("X-Remote-User", jwt_res.payload.loggedInAs)
                pass = true
            else
                print('[JWT] request rejected: ', jwt_res.reason)
            end
        end

        if not pass then
            -- Redirect to /login/?next=...
            local qry = ngx.encode_args({["next"] = full_req_uri})
            ngx.redirect("/login/?" .. qry) -- terminate and immediately redirect!
        end

    else -- protected_mode = internal
        ngx.log(ngx.WARN, "[Blocked] Blocked access to internal path: ", longest_match)
        ngx.exit(ngx.HTTP_FORBIDDEN)
    end
end

--------------------------
--- Print Passed Route ---
--------------------------
local query_params = ngx.var.is_args .. (ngx.var.args or '')
print('[route] pass: ', full_req_uri, ' ==> ',
    ngx.var.service_addr, ngx.var.modified_uri, query_params)
