const express = require('express');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const PORT = process.env.PORT || "19721";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || `http://localhost:${PORT}`;
const REDIRECT_URL_PREFIX = process.env.REDIRECT_URL_PREFIX || "/login?next=";

/**
 * Middleware to handle JWT validation and redirection.
 * Replicates the logic of the Python jwt_middleware.
 */
async function jwtMiddleware(req, res, next) {
    // 1. Short-circuit: if X-Remote-User is injected by the Gateway, trust it completely.
    const remoteUser = req.headers['x-remote-user'];
    if (remoteUser) {
        req.jwtPayload = { loggedInAs: remoteUser };
        return next();
    }

    // 2. Fallback authorization via WEB API
    const token = req.cookies[JWT_COOKIE_NAME] || "";

    let authUrl;
    const authBase = AUTH_BASE_URL.replace(/\/$/, ""); // rstrip('/')

    if (authBase.startsWith("/")) {
        // Construct full URL using request base if it's a relative path
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
        if (!originalUrl) {
            originalUrl = req.originalUrl;
        }

        const encodedUrl = encodeURIComponent(originalUrl);
        const redirectUrl = `${REDIRECT_URL_PREFIX}${encodedUrl}`;

        // Check if client expects JSON
        const accept = req.headers['accept'] || "";
        if (accept.includes("application/json")) {
            return res.json({
                pass: false,
                redirect: redirectUrl
            });
        } else {
            return res.redirect(redirectUrl);
        }
    }
}

module.exports = {
    JWT_COOKIE_NAME,
    AUTH_BASE_URL,
    REDIRECT_URL_PREFIX,
    jwtMiddleware
};
