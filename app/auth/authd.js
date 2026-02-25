const jwt = require('jsonwebtoken');
const express = require('express');
const cookieParser = require('cookie-parser');
const database = require('./database');
const passhash = require('./passhash');
const passport = require('passport');

const PORT = parseInt(process.env.PORT || "19721", 10);
const REDIRECT_URL = process.env.REDIRECT_URL || "/login_page";
const REDIRECT_URL_ARGKEY = process.env.REDIRECT_URL_ARGKEY || "next_url";
const OAUTH2_CALLBK_PREFIX = process.env.OAUTH2_CALLBK_PREFIX || `/`;
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5");
const LOGIN_ATTEMPTS_SPAN = parseInt(process.env.LOGIN_MAX_TIMESPAN || (24 * 60).toString()); // minutes
const JWT_EXPIRE_DAYS = parseInt(process.env.JWT_EXPIRE_DAYS || "1");


async function grantTokenAsSetCookie(res, uid, extraFields={}, scope=null) {
  const isDev = process.env.NODE_ENV === 'development';
  const now = Math.floor(Date.now() / 1000);
  const durationSeconds = isDev ? 10 : JWT_EXPIRE_DAYS * 24 * 60 * 60;
  const exp = now + durationSeconds;
  const payload = {
    ...extraFields,
    uid: uid,
    scope: scope || ["/*"],
    exp: exp,
    maxAge: durationSeconds
  };
  const secret = await database.getJwtSecret();
  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256'
  });
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: !isDev,
    secure: true,
    maxAge: durationSeconds * 1000
  });
  return { token, payload };
}

/**
 * Login a user via email and password
 * @param {string} ipAddress - The IP address of the requester
 * @param {string} email - The user's email
 * @param {string} password - The password provided
 * @returns {Promise<[boolean, Object]>} [success, result/error info]
 */
async function login_via_email_and_password(ipAddress, email, password) {
  console.log(`[login user] ${email}`);

  try {
    const user = await database.getUserBy('AuthEmail.email', email);
    const uid = user ? user.uid : null;

    const [consecFails, attempts] = await database.getLoginAttempts(ipAddress, uid, LOGIN_ATTEMPTS_SPAN);

    console.log(`[login] email=${email}, uid=${uid}, consec_fails=${consecFails}.`);

    // 1. Defend Brute Force
    let leftChances = Math.max(LOGIN_MAX_ATTEMPTS - consecFails, 0);
    if (leftChances === 0) {
      const last = attempts.length - 1;
      const lastFailureTime = new Date(attempts[last].timestamp).getTime();
      const minute_unit = 60 * 1000;
      const unlockTime = lastFailureTime + (LOGIN_ATTEMPTS_SPAN * minute_unit);
      const remainingMinutes = Math.max(1, Math.ceil((unlockTime - Date.now()) / minute_unit));

      const hours = Math.floor(remainingMinutes / 60);
      const minutes = remainingMinutes % 60;
      const formattedTime = hours > 0 ? `${hours}h:${minutes}m` : `${minutes}m`;

      return [false, {
        pass: false,
        code: 100,
        unlock_in: formattedTime,
        errmsg: `Too many login attempts. (User, IP) is locked out! Please try again in ${formattedTime}.`
      }];
    }

    // 2. Verify Credentials
    if (user && user.hashed_password && await passhash.verifyPassword(user.hashed_password, password)) {
      // Success logic
      await database.storeLoginAttempt(ipAddress, uid, true);
      return [true, {
        pass: true,
        uid: user.uid,
        loggedInAs: email,
        algorithm: { algorithm: "HS256" }
      }];

    } else {
      // Failure logic
      await database.storeLoginAttempt(ipAddress, uid, false);
      return [false, {
        pass: false,
        code: 101,
        errmsg: "Wrong password or user not found.",
        left_chances: Math.max(leftChances - 1, 0)
      }];
    }

  } catch (e) {
    console.log(`Login error: ${e.message}`);
    return [false, { pass: false, code: 104, errmsg: e.message }];
  }
}

/**
 * Verify a JWT token
 * @param {string} token
 * @returns {Promise<[boolean, Object]>} [success, decoded/error]
 */
async function verify(token) {
  console.log(`[verify token] ${token.substring(0, 5)}...`);

  try {
    const secret = await database.getJwtSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    return [true, decoded];

  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 102 : 103;
    return [false, {
      pass: false,
      code: code,
      name: err.name,
      message: err.message
    }];
  }
}

/**
 * Configures and enables OAuth2 authentication routes for the Express application.
 * It initializes Passport.js strategies, sets up the necessary `/oauth2/:provider` login endpoints,
 * and handles the `/oauth2/:provider/callback` endpoints to issue JWTs upon successful external authentication.
 *
 * Behavior:
 * - If `NODE_ENV` is 'development', it issues short-lived (10s) tokens without `httpOnly` cookies.
 * - Otherwise, it issues long-lived tokens securely.
 *
 * @param {Object} app - The Express application instance.
 * @param {Array<string>} providers - A list of supported OAuth2 providers (e.g., ['google', 'github']).
 */
function EnableOAuth2Routes(app, providers) {
    app.use(passport.initialize());
    const isDev = process.env.NODE_ENV === 'development';

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
                  const mappedProfile = config.mapProfile(user);
                  const [uid, newlyCreated] = await database.createOrMapUserWithOauth2(
                        provider,
                        mappedProfile.id,
                        mappedProfile
                  );
                  await grantTokenAsSetCookie(res, uid, mappedProfile);

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

// --- HTTP Server ---
const app = express();
app.use(express.json());
app.use(cookieParser());

EnableOAuth2Routes(app, ['google', 'github']);

app.post('/authorization', async (req, res) => {
  const token = req.body.token || "";
  const [pass_check, msg] = await verify(token);
  res.json({ pass: pass_check, msg: msg });
});

app.post('/authentication', async (req, res) => {
  const username = req.body.username || "";
  const password = req.body.password || "";

  const ip_addr = req.headers['x-real-ip'] || req.ip || "127.0.0.1";

  const [pass_check, msg] = await login_via_email_and_password(ip_addr, username, password);

  if (pass_check) {
    const { token, payload } = await grantTokenAsSetCookie(res, msg.uid, { loggedInAs: msg.loggedInAs });
    msg.token = token;
    msg.payload = payload;
  }
  res.json({ pass: pass_check, msg: msg });
});

app.get('/secret', async (req, res) => {
  try {
    const secret = await database.getJwtSecret();
    res.type('text/plain').send(secret);
  } catch (err) {
    res.status(500).send("Error retrieving secret");
  }
});

app.get('/', (req, res) => {
  res.type('text/html').send("<h2>Authd at your service</h2>");
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Starting Auth Server on port ${PORT}...`);
  });
}
