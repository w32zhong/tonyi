const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || `/`;
const REDIRECT_URL_PREFIX = process.env.REDIRECT_URL_PREFIX || "/login?next=";
const JWT_SECRET_URL = process.env.JWT_SECRET_URL || `/secret`;

/**
 * Fetches the JWT secret from the auth server.
 */
async function getJwtSecret() {
    try {
        const response = await fetch(JWT_SECRET_URL);
        return await response.text();
    } catch (e) {
        console.error("Failed to fetch JWT secret:", e.message);
        return process.env.JWT_SECRET || "fallback-secret";
    }
}

/**
 * Passport Configuration
 */
function setupPassport() {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_id',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_secret',
        proxy: true
    },
    (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
    }));
}

/**
 * Helper to construct the absolute callback URL based on the Gateway's prefix.
 * We must force it to be absolute and trust the protocol/host from the Gateway.
 */
function getDynamicCallbackURL(req) {
    let protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers['host'];

    // Force HTTPS for non-localhost domains as required by Google
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
        protocol = 'https';
    }

    const originalUri = req.headers['x-original-uri'] || req.originalUrl;
    const path = originalUri.split('?')[0];

    // Construct absolute URL
    const baseUrl = `${protocol}://${host}${path}`;
    const fullUrl = baseUrl.endsWith('/') ? `${baseUrl}callback` : `${baseUrl}/callback`;
    console.log(`DEBUG [v2]: Generated Callback URL: ${fullUrl}`);
    return fullUrl;
}

/**
 * Phase 1: Initiation (The "Send Off")
 * 1. Constructs the Google OAuth URL with clientID, scope, and callbackURL.
 * 2. Sends a 302 Redirect to the browser to take the user to Google's consent screen.
 */
const googleAuthInitiation = (req, res, next) => {
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        callbackURL: getDynamicCallbackURL(req)
    })(req, res, next);
};

/**
 * Phase 2: Callback (The "Exchange & Verify")
 */
async function googleAuthCallback(req, res, next) {
    let protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers['host'];

    // Force HTTPS for non-localhost domains as required by Google
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
        protocol = 'https';
    }

    const originalUri = req.headers['x-original-uri'] || req.originalUrl;
    const currentPath = originalUri.split('?')[0];
    const absoluteCallbackURL = `${protocol}://${host}${currentPath}`;
    console.log(`DEBUG [v2]: Callback Verification URL: ${absoluteCallbackURL}`);

    // When the browser hits the callback, it doesn't have a token yet, it only has
    // a temporary "claim check" called a "code".
    // If Google sent the actual access token in this callback URL instead of a temporary
    // code, the token key would be dangerously exposed (e.g., by an open Wi-Fi).
    // Instead, if a hacker gets this "code", they still can't do anything with it.
    // To exchange that code for an access token, they must also have your Google Oauth2
    // Client credentials and that secret lives exclusively on your backend server.
    passport.authenticate('google', {
        failureRedirect: '../../login',
        session: false,
        callbackURL: absoluteCallbackURL
    }, async (err, user) => {
        if (err || !user) return res.redirect('../../login');

        const secret = await getJwtSecret();
        const token = jwt.sign({
            id: user.id,
            displayName: user.displayName,
            email: user.emails?.[0]?.value,
            photo: user.photos?.[0]?.value
        }, secret, { expiresIn: '1h' });

        res.cookie(JWT_COOKIE_NAME, token, {
            httpOnly: false,
            secure: true,
            maxAge: 3600 * 1000
        });

        const nextPath = req.query.state || '../../private';
        res.redirect(nextPath);
    })(req, res, next);
}

/**
 * Original Middleware to handle JWT validation and redirection.
 * Replicates the logic of the Python jwt_middleware.
 */
async function jwtMiddleware(req, res, next) {
    // 1. Short-circuit: if X-Remote-User is injected by the Gateway, trust it completely.
    const remoteUser = req.headers['x-remote-user'];
    if (remoteUser) {
        req.jwtPayload = { loggedInAs: remoteUser };
        return next();
    }

    // 2. Fallback authorization via WEB API (if accessed bypassing gateway)
    const token = req.cookies[JWT_COOKIE_NAME] || "";

    let authUrl;
    const authBase = AUTH_BASE_URL.replace(/\/$/, "");

    if (authBase.startsWith("/")) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['host'];
        authUrl = `${protocol}://${host}${authBase}/authorization`;
    } else {
        authUrl = `${authBase}/authorization`;
    }

    let result;
    try {
        const response = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        });
        result = await response.json();
    } catch (e) {
        result = { pass: false, msg: e.message };
    }

    if (result.pass) {
        // Pass the middleware check
        req.jwtPayload = result.msg;
        return next();
    } else {
        // Save URL and redirect for authentication
        let originalUrl = req.headers['x-original-uri'];
        // In Nginx X-Original-URI, it includes the query string.
        if (!originalUrl) {
            originalUrl = req.originalUrl;
        }

        const encodedUrl = encodeURIComponent(originalUrl);
        const redirectUrl = `${REDIRECT_URL_PREFIX}${encodedUrl}`;

        const accept = req.headers['accept'] || "";
        if (accept.includes("application/json")) {
            return res.json({ pass: false, redirect: redirectUrl });
        } else {
            return res.redirect(redirectUrl);
        }
    }
}

module.exports = {
    JWT_COOKIE_NAME,
    AUTH_BASE_URL,
    REDIRECT_URL_PREFIX,
    jwtMiddleware,
    setupPassport,
    googleAuthInitiation,
    googleAuthCallback
};
