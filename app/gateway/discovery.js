const Docker = require('dockerode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
    const sslOpen = await syncSsl();

    const services = await docker.listServices();
    const activeRouteIds = new Set();

    // Redirect and disable plain HTTP if HTTPS is on
    if (sslOpen) {
      console.log(`[50]: HTTP => HTTPS`);
      activeRouteIds.add('global-http-redirect');
    }

    // Discover new routes
    for (const service of services) {
      const labels = service.Spec.Labels || {};
      if (labels['gateway.route']) {
        activeRouteIds.add(service.Spec.Name);
        await rewriteRoute(service, labels);
      }
    }

    // Prune existing orphaned routes
    try {
      const existingRoutes = await axios.get(`${ADMIN_URL}/routes`, { headers: { 'X-API-KEY': ADMIN_KEY } });
      const routes = existingRoutes.data?.list || [];

      for (const route of routes) {
        const routeId = route.value.id;
        if (!activeRouteIds.has(routeId)) {
          console.log(`[Cleanup] Removing orphaned route: ${routeId}`);
          await axios.delete(`${ADMIN_URL}/routes/${routeId}`, { headers: { 'X-API-KEY': ADMIN_KEY } });
        }
      }
    } catch (e) {
      console.error(`[Cleanup] Failed to fetch/prune existing routes: ${e.message}`);
    }

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

async function rewriteRoute(service, labels) {
  const serviceName = service.Spec.Name;
  const routePath = labels['gateway.route'];
  const port = labels['gateway.port'] || '80';

  const d = {
    name: `${serviceName}-route`,
    uris: getRouteUris(routePath),
    priority: getRoutePriority(routePath, labels['gateway.route_priority']),
    enable_websocket: true,
    upstream: getUpstreamConfig(serviceName, port),
    plugins: getPluginsConfig(routePath, labels)
  };

  console.log(`[${d.priority}]: ${d.uris} => ${serviceName}:${port}`);

  try {
    await axios.put(`${ADMIN_URL}/routes/${serviceName}`, d, {
      headers: { 'X-API-KEY': ADMIN_KEY }
    });
  } catch (err) {
    console.error(`Failed to sync ${serviceName}: ${err.message}`);
  }
}

function getRouteUris(routePath) {
  if (routePath === '_root_') return ["/"];
  if (routePath === '_404_') return ["/*"];
  return [`/${routePath}`, `/${routePath}/*` ];
}

function getRoutePriority(routePath, customPriority) {
  if (customPriority) return parseInt(customPriority);
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
      "regex_uri": [`^/${routePath}/(.*)`, "/$1", `^/${routePath}$`, "/"]
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
  let rateCode = 429; // Set for Rate Limit
  let connCode = 503; // Set for Conn Limit

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
    plugins['limit-req'] = {
      rate: rate,
      burst: burst,
      rejected_code: rateCode,
      key_type: "var",
      key: "remote_addr"
    };
  }
  if (conn > 0) {
    plugins['limit-conn'] = {
      conn: conn,
      burst: 0,
      default_conn_delay: 0.1,
      rejected_code: connCode,
      key_type: "var",
      key: "remote_addr"
    };
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

async function syncSsl() {
  if (!gatewayDomain) return false;

  const acmeRoot = '/acme.sh';
  if (!fs.existsSync(acmeRoot)) return false;

  // Find directory matching domain (exact or with _ecc suffix)
  const domainDir = fs.readdirSync(acmeRoot).find(d =>
    d === gatewayDomain || d === `${gatewayDomain}_ecc`
  );

  if (!domainDir) {
    console.warn(`[SSL] no acme directory found for ${gatewayDomain}`);
    return false;
  }

  const certPath = path.join(acmeRoot, domainDir, 'fullchain.cer');
  const keyPath = path.join(acmeRoot, domainDir, `${gatewayDomain}.key`);
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.warn(`[SSL] skipping sync, cert/key not found in ${domainDir}`);
    return false;
  }

  try {
    const cert = fs.readFileSync(certPath, 'utf8');
    const key = fs.readFileSync(keyPath, 'utf8');

    const sslData = {
      id: "gateway-ssl",
      cert: cert,
      key: key,
      snis: [gatewayDomain, `www.${gatewayDomain}`]
    };

    await axios.put(`${ADMIN_URL}/ssls/gateway-ssl`, sslData, {
      headers: { 'X-API-KEY': ADMIN_KEY }
    });
    console.log(`[SSL] synced for ${gatewayDomain} from ${domainDir}`);

    // Create global HTTP -> HTTPS redirect if SSL is on
    if (sslOpen) {
      const d = {
        id: "global-http-redirect",
        uris: ["/*"],
        priority: 50,
        vars: [["scheme", "==", "http"]],
        plugins: {
          redirect: {
            http_to_https: true
          }
        }
      };
      await axios.put(`${ADMIN_URL}/routes/global-http-redirect`, d, {
        headers: { 'X-API-KEY': ADMIN_KEY }
      });
    }

    return true;

  } catch (err) {
    console.error(`[SSL] sync failed: ${err.message}`);
    return false;
  }
}

console.log('Starting Discovery...');
setInterval(discover, 10000);
discover();
