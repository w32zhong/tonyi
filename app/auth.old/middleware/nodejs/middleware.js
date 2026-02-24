const passport = require('passport');
const jwt = require('jsonwebtoken');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const AUTH_BASE_URL = process.env.AUTH_BASE_URL || `/`;
const REDIRECT_URL = process.env.REDIRECT_URL || "/login_page";
const REDIRECT_URL_ARGKEY = process.env.REDIRECT_URL_ARGKEY || "next_url";

const JWT_SECRET_URL = process.env.JWT_SECRET_URL || `/secret`;
const OAUTH2_CALLBK_PREFIX = process.env.OAUTH2_CALLBK_PREFIX || `/`;
const JWT_EXPIRE_DAYS = parseInt(process.env.JWT_EXPIRE_DAYS || "1");

async function getJwtSecret() {
    try {
        const response = await fetch(JWT_SECRET_URL);
        return await response.text();
    } catch (e) {
        console.error("Failed to fetch JWT secret:", e.message);
        return process.env.JWT_SECRET || "fallback-secret";
    }
}

function EnableOAuth2Routes(app, providers, dev_mode=false) {
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
    app.use(passport.initialize());

    const configs = {
        google: {
            Strategy: require('passport-google-oauth20').Strategy,
            options: {
                clientID: process.env.OAUTH2_GOOGLE_CLIENT_ID,
                clientSecret: process.env.OAUTH2_GOOGLE_CLIENT_SECRET,
                proxy: true
            },
            authenticateOptions: {
                scope: ['profile', 'email']
            },
            mapProfile: (profile) => ({
                loggedInAs: profile.emails?.[0]?.value || profile.id,
                id: profile.id,
                displayName: profile.displayName,
                email: profile.emails?.[0]?.value,
                photo: profile.photos?.[0]?.value
            })
        },
        github: {
            Strategy: require('passport-github2').Strategy,
            options: {
                clientID: process.env.OAUTH2_GITHUB_CLIENT_ID,
                clientSecret: process.env.OAUTH2_GITHUB_CLIENT_SECRET,
                proxy: true
            },
            authenticateOptions: {
                scope: ['user:email']
            },
            mapProfile: (profile) => ({
                loggedInAs: profile.username || profile.id,
                id: profile.id,
                displayName: profile.displayName || profile.username,
                email: profile.emails?.[0]?.value,
                photo: profile.photos?.[0]?.value
            })
        }
    };

    for (const provider of providers) {
        const config = configs[provider];
        if (!config) {
            console.error("Unhandled provider:", provider);
            continue;
        }

        passport.use(provider,
            new config.Strategy(config.options, (accessToken, refreshToken, profile, done) => {
                return done(null, profile);
            })
        );

        const getCallbackURL = (req) => {
            let url = `${OAUTH2_CALLBK_PREFIX}/oauth2/${provider}/callback`;
            return url.replace("__REQ_DOMAIN__", req.get('host'));
        };

        app.get(`/oauth2/${provider}`, (req, res, next) => {
            passport.authenticate(provider, {
                ...config.authenticateOptions,
                session: false,
                callbackURL: getCallbackURL(req),
                state: req.query[REDIRECT_URL_ARGKEY] /* save next URL to OAuth2 state */
            })(req, res, next);
        });

        app.get(`/oauth2/${provider}/callback`, (req, res, next) => {
            passport.authenticate(provider, {
                session: false,
                callbackURL: getCallbackURL(req)
            }, async (err, user, info) => {
                const nextUrl = req.query.state || '/';
                const encNextUrl = encodeURIComponent(nextUrl);
                const originUrl = `${REDIRECT_URL}?${REDIRECT_URL_ARGKEY}=${encNextUrl}`;
                const failureUrl = `${originUrl}&oauth2failure=`;

                if (err || !user) {
                    console.error(`OAuth2 ${provider} failure:`, err);
                    return res.redirect(failureUrl + 'provider');
                }

                try {
                    const secret = await getJwtSecret();
                    const expiresIn = dev_mode ? 10 : JWT_EXPIRE_DAYS * 24 * 3600;
                    const token = jwt.sign(config.mapProfile(user), secret, {
                        algorithm: 'HS256',
                        expiresIn: expiresIn
                    });

                    res.cookie(JWT_COOKIE_NAME, token, {
                        httpOnly: !dev_mode,
                        secure: true,
                        maxAge: expiresIn * 1000
                    });

                    // Redirect to the original state (unencoded)
                    res.redirect(nextUrl);

                } catch (e) {
                    console.error("Token signing error:", e);
                    return res.redirect(failureUrl + 'jwt');
                }

            })(req, res, next);
        });
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
        const redirectUrl = `${REDIRECT_URL}?${REDIRECT_URL_ARGKEY}=${encodedUrl}`;

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
    REDIRECT_URL,
    REDIRECT_URL_ARGKEY,
    OAUTH2_CALLBK_PREFIX,
    jwtMiddleware,
    EnableOAuth2Routes,
};
