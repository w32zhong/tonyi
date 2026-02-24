const passport = require('passport');
const jwt = require('jsonwebtoken');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || `/`;
const REDIRECT_URL_PREFIX = process.env.REDIRECT_URL_PREFIX || "/login?next=";
const JWT_SECRET_URL = process.env.JWT_SECRET_URL || `/secret`;
const OAUTH2_CALLBK_PREFIX = process.env.OAUTH2_CALLBK_PREFIX || `/`;

async function getJwtSecret() {
    try {
        const response = await fetch(JWT_SECRET_URL);
        return await response.text();
    } catch (e) {
        console.error("Failed to fetch JWT secret:", e.message);
        return process.env.JWT_SECRET || "fallback-secret";
    }
}

function EnableOAuth2Routes(app, providers) {
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
    app.use(passport.initialize());

    for (const provider of providers) {
        if (provider === 'google') {
            const Strategy = require('passport-google-oauth20').Strategy;
            passport.use(new Strategy({
                    clientID: process.env.OAUTH2_GOOGLE_CLIENT_ID,
                    clientSecret: process.env.OAUTH2_GOOGLE_CLIENT_SECRET,
                    proxy: true
                },
                (accessToken, refreshToken, profile, done) => {
                    return done(null, profile);
                }
            ));

            let callbackURL = `${OAUTH2_CALLBK_PREFIX}/oauth2/${provider}/callback`;
            app.get(`/oauth2/${provider}`, (req, res, next) => {
                callbackURL = callbackURL.replace("__REQ_DOMAIN__", req.get('host'));
                passport.authenticate(provider, {
                    scope: ['profile', 'email'],
                    session: false,
                    callbackURL: callbackURL
                })(req, res, next);
            });

            app.get(`/oauth2/${provider}/callback`,
                passport.authenticate('google', { failureRedirect: '/', session: false }),
                async (req, res) => {
                    const user = req.user;
                    const secret = await getJwtSecret();
                    const token = jwt.sign({
                        id: user.id,
                        displayName: user.displayName,
                        email: user.emails?.[0]?.value,
                        photo: user.photos?.[0]?.value
                    }, secret, { expiresIn: '1h' });

                    res.cookie(JWT_COOKIE_NAME, token, {
                        httpOnly: false, // Set to false so frontend JS can read it for this learning code
                        secure: true, // browser will only send the cookie if it is HTTPS, this is true even
                                      // in dev mode because most OAuth2 providers requires setting an HTTPS
                                      // Authorized redirect URI to even test the OAuth2 process.
                        maxAge: 3600 * 1000 // 1hr in Express.js, maxAge is in milliseconds
                    });

                    const nextPath = req.query.state;
                    res.redirect(nextPath);
                }
            );

        } else if (provider == 'github') {
            // TODO

        } else {
            console.error("Unhandled provider:", provider);
        }
    }
}

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
    OAUTH2_CALLBK_PREFIX,
    jwtMiddleware,
    EnableOAuth2Routes,
};
