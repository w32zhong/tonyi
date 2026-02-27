const jwt = require('jsonwebtoken');

// Configuration from environment
const ENV = (typeof process !== "undefined" && process.env) ? process.env : {};
const JWT_SECRET_URL = ENV.JWT_SECRET_URL || null;
const JWT_COOKIE_NAME = ENV.JWT_COOKIE_NAME || "jwt";
const REDIRECT_URL = ENV.REDIRECT_URL || "/login_page";
const REDIRECT_URL_ARGKEY = ENV.REDIRECT_URL_ARGKEY || "next_url";

function DynamicNodejsRequire() {
    if (typeof process === "undefined" || !process.versions?.node) {
        return null;

    } else if (typeof module !== "undefined" && typeof module.require === "function") {
        // Bind to this module so relative paths can resolve
        return module.require.bind(module);
    }
    return null;
}

function loadLocalDatabase() {
    const nodeRequire = DynamicNodejsRequire();
    if (!nodeRequire) return null;
    try {
        return nodeRequire("./database");
    } catch (err) {
        console.error("Auth Middleware: Failed to load local database module:", err.message);
        return null;
    }
}

function loadPowModule() {
    const nodeRequire = DynamicNodejsRequire();
    if (!nodeRequire) return null;
    try {
        return nodeRequire("./pow");
    } catch (err) {
        console.error("Auth Middleware: Failed to load PoW module:", err.message);
        return null;
    }
}

/**
 * Fetch the JWT secret from the central auth server
 * @returns {Promise<string|null>}
 */
async function getJwtSecret() {
    // If no URL is configured, middleware is expected to use local database.
    if (!JWT_SECRET_URL) {
        const database = loadLocalDatabase();
        try {
            return await database.getJwtSecret();
        } catch (err) {
            console.error("Auth Middleware: Failed to read local JWT secret:", err.message);
            return null;
        }
    } else {
        try {
            const response = await fetch('http://' + JWT_SECRET_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.text();
        } catch (err) {
            console.error("Auth Middleware: Failed to fetch JWT secret:", err.message);
            return null;
        }
    }
}

/**
 * Express middleware to verify a PoW solution before allowing an expensive action.
 * Expects challenge, signature, and solution in req.body.
 */
async function requirePoW(req, res, next) {
    const { challenge, signature, solution } = req.body;

    if (!challenge || !signature || !solution) {
        return res.status(400).json({
            pass: false,
            reason: 'missing_pow',
            errmsg: 'PoW (challenge, signature, solution) required.'
        });
    }

    const secret = await getJwtSecret();
    if (!secret) {
        return res.status(500).send("Internal Server Error: Auth Secret Unavailable");
    }

    const pow = loadPowModule();
    if (!pow?.verifyPowSolution) {
        return res.status(500).send("Internal Server Error: PoW Module Unavailable");
    }

    const [isValid, salt] = await pow.verifyPowSolution(secret, challenge, signature, solution);

    if (isValid) {
        req.powSalt = salt;
        return next();
    } else {
        return res.status(403).json({
            pass: false,
            reason: 'invalid_pow',
            errmsg: 'Invalid or expired PoW solution.'
        });
    }
}
/**
 * Express middleware to require a valid JWT or a trusted Gateway header.
 * Attaches the decoded payload to req.user.
 */
async function requireAuth(req, res, next) {
    // 1. Trust Gateway Header (X-Remote-User) as uid if present
    const remoteUid = req.headers['x-remote-user'];
    if (remoteUid) {
        const uid = Number(remoteUid);
        req.user = { uid, via: 'gateway' };
        return next();
    }

    // 2. Check for JWT in cookies
    const token = req.cookies?.[JWT_COOKIE_NAME];
    if (!token) {
        return handleAuthFailure(req, res);
    }

    // 3. Verify JWT locally
    const secret = await getJwtSecret();
    if (!secret) {
        return res.status(500).send("Internal Server Error: Auth Secret Unavailable");
    }

    try {
        const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
        decoded.uid = Number(decoded.uid);
        req.user = decoded;
        next();
    } catch (err) {
        console.log("Auth Middleware: JWT Verification Failed:", err.message);
        handleAuthFailure(req, res);
    }
}

/**
 * Handle authentication failure by redirecting or returning JSON
 */
function handleAuthFailure(req, res) {
    const originalUrl = req.headers['x-original-uri'] || req.originalUrl;
    const encodedUrl = encodeURIComponent(originalUrl);
    const redirectUrl = `${REDIRECT_URL}?${REDIRECT_URL_ARGKEY}=${encodedUrl}`;

    const accept = req.headers['accept'] || "";
    if (req.xhr || accept.includes("application/json")) {
        return res.status(401).json({
            pass: false,
            redirect: redirectUrl
        });
    } else {
        return res.redirect(redirectUrl);
    }
}

module.exports = {
    requirePoW,
    requireAuth
};
