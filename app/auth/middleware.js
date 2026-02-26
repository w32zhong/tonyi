const jwt = require('jsonwebtoken');
const pow = require('./pow');

// Configuration from environment
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "/";
const REDIRECT_URL = process.env.REDIRECT_URL || "/login_page";
const REDIRECT_URL_ARGKEY = process.env.REDIRECT_URL_ARGKEY || "next_url";

/**
 * Fetch the JWT secret from the central auth server
 * @returns {Promise<string|null>}
 */
async function getJwtSecret() {
    try {
        const url = AUTH_BASE_URL.endsWith('/') ? `${AUTH_BASE_URL}secret` : `${AUTH_BASE_URL}/secret`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    } catch (err) {
        console.error("Auth Middleware: Failed to fetch JWT secret:", err.message);
        return null;
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
    // 1. Trust Gateway Header (X-Remote-User) if present
    const remoteUser = req.headers['x-remote-user'];
    if (remoteUser) {
        req.user = { loggedInAs: remoteUser, via: 'gateway' };
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
