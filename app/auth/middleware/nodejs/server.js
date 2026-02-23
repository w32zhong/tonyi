/**
 * Test server — reference usage of jwtMiddleware.
 *
 * Downstream service integration demo:
 *   - GET  /login          serve login page
 *   - GET  /private        protected route via jwtMiddleware
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const {
    jwtMiddleware,
    AUTH_BASE_URL,
    JWT_COOKIE_NAME,
    REDIRECT_URL_PREFIX
} = require('./middleware');

const app = express();
const TEST_PORT = process.env.TEST_PORT || 18000;

app.use(cookieParser());

// Route: Login Page
app.get('/login', (req, res) => {
    const logout = req.query.logout === 'true';

    let html = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
    html = html.replace(/__AUTH_BASE_URL__/g, AUTH_BASE_URL);

    if (logout) {
        res.clearCookie(JWT_COOKIE_NAME);
    }

    res.send(html);
});

// Route: Private Page (Protected)
app.get('/private', jwtMiddleware, (req, res) => {
    const jwtPayload = req.jwtPayload;

    let html = fs.readFileSync(path.join(__dirname, '..', 'private.html'), 'utf8');
    html = html.replace(/__PAYLOAD__/g, JSON.stringify(jwtPayload, null, 2));
    html = html.replace(/__USERNAME__/g, jwtPayload.loggedInAs || "stranger");

    res.send(html);
});

app.listen(TEST_PORT, '0.0.0.0', () => {
    console.log(`Test server starting on port ${TEST_PORT}`);
    console.log(`AUTH_BASE_URL: ${AUTH_BASE_URL}`);
    console.log(`JWT_COOKIE_NAME: ${JWT_COOKIE_NAME}`);
    console.log(`REDIRECT_URL_PREFIX: ${REDIRECT_URL_PREFIX}`);
});
