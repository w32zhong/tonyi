const Docker = require('dockerode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const ADMIN_URL = process.env.APISIX_ADMIN_URL;
const ADMIN_KEY = process.env.APISIX_ADMIN_KEY;

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
    console.log('--- service discover ---');
    const jwtSecret = await fetchJwtSecret();
    const sslOpen = await syncSsl();
    await updateConsumer(jwtSecret);

    const activeRouteIds = new Set();
    const services = await docker.listServices();

    // Discover new routes
    for (const service of services) {
      const labels = service.Spec.Labels || {};
      if (labels['gateway.route']) {
        activeRouteIds.add(service.Spec.Name);
        await rewriteRoute(service, labels, sslOpen);
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

async function fetchJwtSecret() {
  try {
    const res = await axios.get(`http://${jwtSecretUrl}`, { timeout: 6000 });
    const jwtSecret = res.data;
    console.log(`[JWT] secret loaded: ${jwtSecret.substring(0, 5)}...`);
    return jwtSecret;

  } catch (err) {
    console.error(`[JWT] secret unavailable: ${err.message}`);
    return null;
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
    console.warn(`[SSL] skipping, no acme directory ${gatewayDomain}`);
    return false;
  }

  const certPath = path.join(acmeRoot, domainDir, 'fullchain.cer');
  const keyPath = path.join(acmeRoot, domainDir, `${gatewayDomain}.key`);
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.warn(`[SSL] skipping, cert/key not found in ${domainDir}`);
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
    console.log(`[SSL] SSL is on: ${gatewayDomain} from ${domainDir}`);
    return true;

  } catch (err) {
    console.error(`[SSL] SSL setup failed: ${err.message}`);
    return false;
  }
}

async function updateConsumer(jwtSecret) {
  try {
    const d = {
      username: "dummy-consumer",
      plugins: {
        "jwt-auth": {
          key: "gateway-auth", /* for `iss: gateway-auth` in a JWT payload */
          /* the secret is used globally, if it is unset, fallback to random */
          secret: jwtSecret || crypto.randomBytes(32).toString('hex')
        }
      }
    };
    await axios.put(`${ADMIN_URL}/consumers`, d, {
      headers: { 'X-API-KEY': ADMIN_KEY }
    });
  } catch (err) {
    console.error(`[Consumer] sync failed: ${err.message}`);
  }
}

async function rewriteRoute(service, labels, sslOpen) {
  const serviceName = service.Spec.Name;
  const routePath = labels['gateway.route'];
  const port = labels['gateway.port'] || '80';
  const priority = getRoutePriority(routePath, labels['gateway.route_priority']);

  // Redirect HTTP to HTTPS if SSL is on, EXCEPT for high priority routes
  const forceHttps = (sslOpen && priority !== 100)

  const d = {
    name: `${serviceName}-route`,
    uris: getRouteUris(routePath),
    priority: priority,
    enable_websocket: true,
    upstream: getUpstreamConfig(serviceName, port),
    plugins: getPluginsConfig(routePath, labels, forceHttps)
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

function getPluginsConfig(routePath, labels, forceHttps) {
  const plugins = {};
  if (forceHttps) {
    plugins["redirect"] = {
      "http_to_https": true
    };
  }

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
  if (!protectLabel) return;
  try {
    const paths = JSON.parse(protectLabel);
    const regex = `^(${paths.join('|')})`;

    plugins["jwt-auth"] = {
      cookie: jwtCookieName,
      key_claim_name: "iss",
      _meta: {
        filter: [
          ["uri", "~~", regex]
        ]
      }
    };
  } catch (e) {
    console.error(`Protect paths parse error: ${e.message}`);
  }
}

setInterval(discover, 10 * 1000);
discover();
