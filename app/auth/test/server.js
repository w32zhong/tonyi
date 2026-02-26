const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// These should match what's in authd.js / middleware.js or be overridden by env
const PORT = process.env.PORT || 3000;
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "/auth";
const REDIRECT_URL = process.env.REDIRECT_URL || "/login";
const REDIRECT_URL_ARGKEY = process.env.REDIRECT_URL_ARGKEY || "next";

const app = express();
app.use(cookieParser());

// Mock jwtMiddleware for test server
const jwtMiddleware = async (req, res, next) => {
    const token = req.cookies[JWT_COOKIE_NAME];
    if (!token) {
        const nextUrl = encodeURIComponent(req.originalUrl);
        return res.redirect(`${REDIRECT_URL}?${REDIRECT_URL_ARGKEY}=${nextUrl}`);
    }

    try {
        // In a real test, we might want to fetch the secret,
        // but for a simple test server we might just skip verification or use a dummy secret
        // if we just want to show the payload in the UI.
        const decoded = jwt.decode(token);
        req.jwtPayload = decoded;
        next();
    } catch (err) {
        res.redirect(REDIRECT_URL);
    }
};

app.get('/login', (req, res) => {
    const logout = req.query.logout === 'true';

    let html = fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');
    html = html.replace(/__AUTH_BASE_URL__/g, AUTH_BASE_URL);
    html = html.replace(/__COOKIE_NAME__/g, JWT_COOKIE_NAME);
    html = html.replace(/__REDIRECT_URL_ARGKEY__/g, REDIRECT_URL_ARGKEY);

    if (logout) {
        res.clearCookie(JWT_COOKIE_NAME);
    }

    res.send(html);
});

app.get('/busybot.mjs', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'node_modules', 'busybot', 'index.mjs'));
});

app.get('/private', jwtMiddleware, (req, res) => {
    const jwtPayload = req.jwtPayload;

    let html = fs.readFileSync(path.join(__dirname, 'private.html'), 'utf8');
    html = html.replace(/__PAYLOAD__/g, JSON.stringify(jwtPayload, null, 2));
    html = html.replace(/__USERNAME__/g, jwtPayload?.loggedInAs || jwtPayload?.displayName || "stranger");
    html = html.replace(/__COOKIE_NAME__/g, JWT_COOKIE_NAME);
    html = html.replace(/__REDIRECT_URL__/g, REDIRECT_URL);

    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Test server starting on port ${PORT}`);
    console.log(`JWT_COOKIE_NAME: ${JWT_COOKIE_NAME}`);
    console.log(`AUTH_BASE_URL: ${AUTH_BASE_URL}`);
    console.log(`REDIRECT_URL: ${REDIRECT_URL}`);
    console.log(`REDIRECT_URL_ARGKEY: ${REDIRECT_URL_ARGKEY}`);
});
