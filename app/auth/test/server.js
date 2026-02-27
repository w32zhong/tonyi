const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('../middleware');

const PORT = process.env.PORT || 3000;
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "/auth";
const REDIRECT_URL = process.env.REDIRECT_URL || "/login";
const REDIRECT_URL_ARGKEY = process.env.REDIRECT_URL_ARGKEY || "next";
const JWT_SECRET_URL = process.env.JWT_SECRET_URL;

const app = express();
app.use(cookieParser());

function renderTestHtml(req, user = null) {
    let html = fs.readFileSync(path.join(__dirname, 'test.html'), 'utf8');
    html = html.replace(/__AUTH_BASE_URL__/g, AUTH_BASE_URL);
    html = html.replace(/__REDIRECT_URL_ARGKEY__/g, REDIRECT_URL_ARGKEY);
    html = html.replace(/__REDIRECT_URL__/g, REDIRECT_URL);
    html = html.replace(/__IS_PRIVATE__/g, user ? "true" : "false");
    html = html.replace(/__PAYLOAD__/g, user ? JSON.stringify(user, null, 2) : "null");
    html = html.replace(/__PAGE_TITLE__/g, user? "Private Profile & Settings": "Sign In");
    return html;
}

app.get('/login', (req, res) => {
    const logout = req.query.logout === 'true';
    if (logout) { res.clearCookie(JWT_COOKIE_NAME); }
    res.send(renderTestHtml(req));
});

app.get('/busybot.mjs', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'node_modules', 'busybot', 'index.mjs'));
});

app.get('/private', requireAuth, (req, res) => {
    res.send(renderTestHtml(req, req.user));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Test server starting on port ${PORT}`);
    console.log(`Using middleware from: ${path.resolve(__dirname, '../middleware.js')}`);
    console.log(`AUTH_BASE_URL: ${AUTH_BASE_URL}`);
    console.log(`JWT_COOKIE_NAME: ${JWT_COOKIE_NAME}`);
    console.log(`JWT_SECRET_URL: ${JWT_SECRET_URL}`);
    console.log(`REDIRECT_URL: ${REDIRECT_URL}`);
    console.log(`REDIRECT_URL_ARGKEY: ${REDIRECT_URL_ARGKEY}`);
});
