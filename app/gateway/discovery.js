const Docker = require('dockerode');
const axios = require('axios');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const ADMIN_URL = process.env.APISIX_ADMIN_URL;
const ADMIN_KEY = process.env.APISIX_ADMIN_KEY;

const redirectUrl = process.env.REDIRECT_URL;
const redirectUrlArgkey = process.env.REDIRECT_URL_ARGKEY;

let jwtSecret = null;
const jwtSecretUrl = process.env.JWT_SECRET_URL;
const jwtCookieName = process.env.JWT_COOKIE_NAME;

const defaultReqRate = parseInt(process.env.DEFAULT_REQ_RATE);
const defaultBurst = parseInt(process.env.DEFAULT_BURST);
const defaultConnMax = parseInt(process.env.DEFAULT_CONN_MAX);

const gatewayDomain = process.env.GATEWAY_DOMAIN;

/**
 * Main discovery loop
 */
async function discover() {
  try {
    await updateJwtSecret();
    if (gatewayDomain) await bootstrapSSLCertificate(gatewayDomain);

    const services = await docker.listServices();
    let found404 = false;

    // 1. Gather all expected service names from Swarm
    const activeServiceNames = new Set();

    for (const service of services) {
      const labels = service.Spec.Labels || {};
      if (labels['gateway.route']) {
        activeServiceNames.add(service.Spec.Name);
        if (labels['gateway.route'] === '_404_') found404 = true;
        await syncServiceRoute(service, labels);
      }
    }

    // 2. Fetch existing routes from APISIX and prune orphaned ones
    try {
      const existingRoutes = await axios.get(`${ADMIN_URL}/routes`, { headers: { 'X-API-KEY': ADMIN_KEY } });
      const routes = existingRoutes.data?.list || [];

      for (const route of routes) {
        // We only manage routes created by discovery (they use the serviceName as ID)
        // Skip default-404 as it is handled separately
        const routeId = route.value.id;
        if (routeId !== 'default-404' && !activeServiceNames.has(routeId)) {
          console.log(`[Cleanup] Removing orphaned route: ${routeId}`);
          await axios.delete(`${ADMIN_URL}/routes/${routeId}`, { headers: { 'X-API-KEY': ADMIN_KEY } });
        }
      }
    } catch (e) {
      console.error(`[Cleanup] Failed to fetch/prune existing routes: ${e.message}`);
    }

    await handleDefault404Fallback(found404);
  } catch (err) {
    console.error(`Error during discovery: ${err.message}`);
  }
}

async function updateJwtSecret() {
  try {
    const res = await axios.get(`http://${jwtSecretUrl}`, { timeout: 6000 });
    jwtSecret = res.data;
    console.log(`[JWT] secret loaded: ${jwtSecret.substring(0, 5)}...`);
  } catch (err) {
    console.error(`[JWT] secret unavailable: ${err.message}`);
  }
}

async function bootstrapSSLCertificate(domain) {
  const sslId = "main-domain-ssl";
  try {
    await axios.get(`${ADMIN_URL}/ssl/${sslId}`, { headers: { 'X-API-KEY': ADMIN_KEY } });
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.log(`[SSL] Provisioning Let's Encrypt certificate for ${domain}...`);
      try {
        const d = {
          snis: [domain, `www.${domain}`],
          key: "placeholder-key", // APISIX acme plugin requires placeholders here
          cert: "placeholder-cert",
          plugin_name: "acme"
        };
        await axios.put(`${ADMIN_URL}/ssl/${sslId}`, d, { headers: { 'X-API-KEY': ADMIN_KEY } });
        console.log(`[SSL] Successfully configured APISIX to fetch certificates for ${domain}.`);
      } catch (putErr) {
        console.error(`[SSL] Failed to configure certificate: ${putErr.message}`);
      }
    }
  }
}

/**
 * Syncs a single service's configuration to APISIX
 */
async function syncServiceRoute(service, labels) {
  const serviceName = service.Spec.Name;
  const routePath = labels['gateway.route'];
  const port = labels['gateway.port'] || '80';

  const d = {
    name: `${serviceName}-route`,
    uri: getRouteUri(routePath),
    priority: getRoutePriority(routePath),
    enable_websocket: true,
    upstream: getUpstreamConfig(serviceName, port),
    plugins: getPluginsConfig(routePath, labels)
  };

  console.log(`[${d.priority}]: ${d.uri} => ${serviceName}:${port}`);
  const logPlugins = { ...d.plugins };
  delete logPlugins['serverless-pre-function'];
  console.log(JSON.stringify(logPlugins, null, 2));

  try {
    await axios.put(`${ADMIN_URL}/routes/${serviceName}`, d, {
      headers: { 'X-API-KEY': ADMIN_KEY }
    });
  } catch (err) {
    console.error(`Failed to sync ${serviceName}: ${err.message}`);
  }
}

function getRouteUri(routePath) {
  if (routePath === '_root_') return "/";
  if (routePath === '_404_') return "/*";
  return `/${routePath}/*`;
}

function getRoutePriority(routePath) {
  if (routePath === '_root_') return 0;
  if (routePath === '_404_') return -1;
  return 10;
}

function getUpstreamConfig(serviceName, port) {
  return {
    type: 'roundrobin',
    nodes: { [`${serviceName}:${port}`]: 1 }
  };
}

function getPluginsConfig(routePath, labels) {
  const plugins = {};

  const isRoot = routePath === '_root_';
  const is404 = routePath === '_404_';
  if (!isRoot && !is404) {
    plugins["proxy-rewrite"] = {
      "regex_uri": [`^/${routePath}/(.*)`, "/$1"]
    };
  }

  applyRateLimitPlugins(plugins, labels['gateway.limits']);
  applyUriBlockerPlugin(plugins, labels['gateway.internal']);
  applyJwtProtectPlugin(plugins, labels['gateway.protect']);
  return plugins;
}

function applyRateLimitPlugins(plugins, limitsLabel) {
  let rate = defaultReqRate;
  let burst = defaultBurst;
  let conn = defaultConnMax;

  if (limitsLabel) {
    try {
      const limits = JSON.parse(limitsLabel);
      if (limits.rate !== undefined) rate = limits.rate;
      if (limits.burst !== undefined) burst = limits.burst;
      if (limits.conn !== undefined) conn = limits.conn;
    } catch (e) {
      console.error(`Limit parse error: ${e.message}`);
    }
  }

  if (rate > 0) {
    plugins['limit-req'] = { rate: rate, burst: burst, key_type: "var", key: "remote_addr" };
  }
  if (conn > 0) {
    plugins['limit-conn'] = { conn: conn, burst: 0, default_conn_delay: 0.1, key_type: "var", key: "remote_addr" };
  }
}

function applyUriBlockerPlugin(plugins, internalLabel) {
  if (!internalLabel) return;
  try {
    plugins['uri-blocker'] = {
      block_rules: JSON.parse(internalLabel),
      rejected_code: 403
    };
  } catch (e) {
    console.error(`Internal paths parse error: ${e.message}`);
  }
}

function applyJwtProtectPlugin(plugins, protectLabel) {
  if (!protectLabel || !jwtSecret) return;
  try {
    const paths = JSON.parse(protectLabel);

    const luaScript = `
      return function()
        local jwt = require "resty.jwt"
        local validators = require "resty.jwt-validators"

        local check_path = ngx.var.uri
        local is_protected = false
        local protect_paths = { ${paths.map(p => `["${p}"] = true`).join(', ')} }

        for k, _ in pairs(protect_paths) do
            if string.find(check_path, k, 1, true) == 1 then
                is_protected = true
                break
            end
        end

        if is_protected then
            local jwt_secret = "${jwtSecret}"
            local jwt_token = ngx.var["cookie_${jwtCookieName}"]
            local pass = false

            if jwt_secret and jwt_token then
                local claim_spec = { exp = validators.is_not_expired() }
                local jwt_res = jwt:verify(jwt_secret, jwt_token, claim_spec)

                if jwt_res.valid and jwt_res.verified then
                    local uid = jwt_res.payload and jwt_res.payload.uid
                    if uid then
                        ngx.req.set_header("X-Remote-User", tostring(uid))
                        pass = true
                    end
                end
            end

            if not pass then
                local full_req_uri = ngx.var.request_uri
                local qry = ngx.encode_args({["${redirectUrlArgkey}"] = full_req_uri})
                ngx.redirect("${redirectUrl}?" .. qry)
            end
        end
      end
    `;

    plugins['serverless-pre-function'] = {
      phase: "rewrite",
      functions: [luaScript]
    };

  } catch (e) {
    console.error(`Protect paths parse error: ${e.message}`);
  }
}

async function handleDefault404Fallback(found404) {
  const fallbackId = 'default-404';
  if (!found404) {
    const d = {
      uri: "/*",
      name: "default-404-fallback",
      priority: -1,
      plugins: {
        "return": {
          "code": 404,
          "body": "<html><body><h2>404 Page not found</h2></body></html>",
          "headers": { "Content-Type": "text/html; charset=utf-8" }
        }
      }
    };
    await axios.put(`${ADMIN_URL}/routes/${fallbackId}`, d, { headers: { 'X-API-KEY': ADMIN_KEY } });
  } else {
    try {
      await axios.delete(`${ADMIN_URL}/routes/${fallbackId}`, { headers: { 'X-API-KEY': ADMIN_KEY } });
    } catch (e) { /* ignore */ }
  }
}

console.log('Starting Discovery...');
setInterval(discover, 10000);
discover();
