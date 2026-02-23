const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Check for required env vars
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set.");
}

app.use(express.static(path.join(__dirname, 'public')));

/**
 * 1. passport.initialize() boots up Passport and adds helper methods
 * like req.login/logout and req.isAuthenticated to the req object.
 */
app.use(passport.initialize());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_secret',
    callbackURL: "/auth/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    // This verify callback is called after Phase 2 (Code Exchange) is successful.
    // The 'profile' returned here is what Passport will attach to 'req.user'.
    return done(null, profile);
  }
));

/**
 * Phase 1: Initiation (The "Send Off")
 * 1. Constructs the Google OAuth URL with clientID, scope, and callbackURL.
 * 2. Sends a 302 Redirect to the browser to take the user to Google's consent screen.
 */
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

/**
 * Phase 2: Callback (The "Exchange & Verify")
 * 1. Detects the 'code' in the URL query string sent back by Google.
 * 2. Exchanges the 'code' for an 'accessToken' via a background server-to-server request.
 * 3. Uses the 'accessToken' to fetch the user's profile from Google.
 * 4. Calls the Strategy's verify callback and populates 'req.user' with the result.
 */
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/', session: false }),
    (req, res) => {
        // req.user is now populated by the second passport.authenticate() call.
        const user = req.user;

        // Create JWT: Statelessly sign the user info into a token.
        const token = jwt.sign({
            id: user.id,
            displayName: user.displayName,
            email: user.emails?.[0]?.value,
            photo: user.photos?.[0]?.value
        }, JWT_SECRET, { expiresIn: '1h' });

        // Set Cookie: Send the JWT back to the browser.
        res.cookie('jwt', token, {
            httpOnly: false, // Set to false so frontend JS can read it for this learning code
            secure: true, // The browser will only send the cookie if the connection is HTTPS
            maxAge: 3600 * 1000 // 1hr in Express.js, maxAge is in milliseconds
        });

        res.redirect('/');
    }
);

app.listen(PORT, () => {
    console.log(`Playground running at http://localhost:${PORT}`);
});
