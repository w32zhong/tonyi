const express = require('express');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const fs = require('fs');
const path = require('path');
const {
    jwtMiddleware,
    setupPassport,
    googleAuthInitiation,
    googleAuthCallback,
    AUTH_BASE_URL,
    JWT_COOKIE_NAME,
} = require('./middleware');

const PORT = process.env.PORT || 18000;

const app = express();
app.use(cookieParser());

/**
 * 1. passport.initialize() boots up Passport and adds helper methods
 * like req.login/logout and req.isAuthenticated to the req object.
 */
app.use(passport.initialize());
setupPassport();

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

/**
 * Phase 1: Initiation (The "Send Off")
 * 1. Constructs the Google OAuth URL with clientID, scope, and callbackURL.
 * 2. Sends a 302 Redirect to the browser to take the user to Google's consent screen.
 */
app.get('/oauth2/google', googleAuthInitiation);

/**
 * Phase 2: Callback (The "Exchange & Verify")
 * 1. Detects the 'code' in the URL query string sent back by Google.
 * 2. Exchanges the 'code' for an 'accessToken' via a background server-to-server request.
 * 3. Uses the 'accessToken' to fetch the user's profile from Google.
 * 4. Calls the Strategy's verify callback and populates 'req.user' with the result.
 */
app.get('/oauth2/google/callback', googleAuthCallback);

// Route: Private Page (Protected)
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
    console.log(`AUTH_BASE_URL: ${AUTH_BASE_URL}`);
    console.log(`JWT_COOKIE_NAME: ${JWT_COOKIE_NAME}`);
});
