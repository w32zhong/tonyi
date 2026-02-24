const express = require('express');
const fs = require('fs');
const path = require('path');
const {
    jwtMiddleware,
    EnableOAuth2Routes,
    JWT_COOKIE_NAME,
    AUTH_BASE_URL,
    REDIRECT_URL_PREFIX,
    OAUTH2_CALLBK_PREFIX
} = require('./middleware');

const PORT = process.env.PORT || 3000;

const app = express();

EnableOAuth2Routes(app, ["google"]);

app.get('/login', (req, res) => {
    const logout = req.query.logout === 'true';

    let html = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
    html = html.replace(/__AUTH_BASE_URL__/g, AUTH_BASE_URL);

    if (logout) {
        res.clearCookie(JWT_COOKIE_NAME);
    }

    res.send(html);
});

app.get('/private', jwtMiddleware, (req, res) => {
    const jwtPayload = req.jwtPayload;

    let html = fs.readFileSync(path.join(__dirname, '..', 'private.html'), 'utf8');
    html = html.replace(/__PAYLOAD__/g, JSON.stringify(jwtPayload, null, 2));
    html = html.replace(/__USERNAME__/g, jwtPayload.loggedInAs || jwtPayload.displayName || "stranger");
    html = html.replace(/__COOKIE_NAME__/g, JWT_COOKIE_NAME);

    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Test server starting on port ${PORT}`);
    console.log(`JWT_COOKIE_NAME: ${JWT_COOKIE_NAME}`);
    console.log(`AUTH_BASE_URL: ${AUTH_BASE_URL}`);
    console.log(`REDIRECT_URL_PREFIX: ${REDIRECT_URL_PREFIX}`);
    console.log(`OAUTH2_CALLBK_PREFIX: ${OAUTH2_CALLBK_PREFIX}`);
});
