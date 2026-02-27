const jwt = require('jsonwebtoken');
const express = require('express');
const cookieParser = require('cookie-parser');
const passport = require('passport');

const database = require('./database');
const passhash = require('./passhash');
const { generatePowChallenge } = require('./pow');
const { email_verification_code } = require('./email');
const { requirePoW, requireAuth } = require('./middleware');

const PORT = parseInt(process.env.PORT || "19721", 10);
const REDIRECT_URL = process.env.REDIRECT_URL || "/login_page";
const REDIRECT_URL_ARGKEY = process.env.REDIRECT_URL_ARGKEY || "next_url";
const OAUTH2_CALLBK_PREFIX = process.env.OAUTH2_CALLBK_PREFIX || `/`;
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5");
const LOGIN_ATTEMPTS_SPAN = parseInt(process.env.LOGIN_MAX_TIMESPAN || (24 * 60).toString()); // minutes
const EMAIL_MAX_SEND_PER_IP = parseInt(process.env.EMAIL_MAX_SEND_PER_IP || "30");
const EMAIL_MAX_SEND_PER_EMAIL = parseInt(process.env.EMAIL_MAX_SEND_PER_EMAIL || "3");
const EMAIL_ATTEMPTS_SPAN = parseInt(process.env.EMAIL_MAX_TIMESPAN || (24 * 60).toString()); // minutes
const EMAIL_VERIFY_EXPIRATION = parseInt(process.env.EMAIL_VERIFY_EXPIRATION || (2).toString()); // minutes
const JWT_EXPIRE_DAYS = parseInt(process.env.JWT_EXPIRE_DAYS || "1");
const OAUTH2_PROVIDERS = (process.env.OAUTH2_PROVIDERS || "").split(',');


/**
 * Formats a duration in minutes into a human-readable string (e.g., "1h:30m" or "45m").
 *
 * @param {number} m - The duration in minutes.
 * @returns {string} The formatted duration string.
 */
function formatSpan(m) {
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  return hours > 0 ? `${hours}h:${minutes}m` : `${minutes}m`;
}

/**
 * Generates a JSON Web Token (JWT) for a verified user and sets it as an HTTP-only cookie.
 *
 * Behavior:
 * - Computes token expiration based on `JWT_EXPIRE_DAYS` or development mode constraints.
 * - Injects standard claims along with any provided `extraFields`.
 * - Sets the cookie securely (omitting `httpOnly` only in development mode).
 *
 * @param {Object} res - The Express response object used to set the cookie.
 * @param {Object} [claims={}] - Additional custom claims to embed in the JWT.
 * @param {Array<string>} [scope=null] - The authorization scopes for the user (defaults to `["/*"]`).
 * @returns {Promise<{token: string, payload: Object}>} The generated token and its decoded payload object.
 */
async function grantTokenAsSetCookie(res, claims={}, scope=null) {
  const isDev = process.env.NODE_ENV === 'development';
  const now = Math.floor(Date.now() / 1000);
  const durationSeconds = isDev ? 10 : JWT_EXPIRE_DAYS * 24 * 60 * 60;
  const exp = now + durationSeconds;
  const payload = {
    ...claims,
    scope: scope || ["read,write"], exp
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
    if (leftChances === 0 && attempts.length > 0) {
      const lastFailureTime = new Date(attempts[0].timestamp).getTime();
      const minute_unit = 60 * 1000;
      const unlockTime = lastFailureTime + (LOGIN_ATTEMPTS_SPAN * minute_unit);
      const remainingMinutes = Math.max(1, Math.ceil((unlockTime - Date.now()) / minute_unit));
      const unlockIn = formatSpan(remainingMinutes);

      return {
        pass: false,
        reason: 'lockout',
        unlock_in: unlockIn,
        errmsg: `Too many login attempts. (User, IP) is locked out! Please try again in ${unlockIn}.`
      };
    }

    // 2. Verify Credentials
    if (user && user.hashed_password && await passhash.verifyPassword(user.hashed_password, password)) {
      // Success logic
      await database.storeLoginAttempt(ipAddress, uid, true);
      return {
        pass: true,
        uid: user.uid, email, displayName: email, newlyCreated: false,
        algorithm: { algorithm: "HS256" }
      };

    } else {
      // Failure logic
      await database.storeLoginAttempt(ipAddress, uid, false);
      return {
        pass: false,
        reason: 'invalid_credentials',
        errmsg: "Wrong password or user not found.",
        left_chances: Math.max(leftChances - 1, 0)
      };
    }

  } catch (e) {
    console.log(`Login error: ${e.message}`);
    return { pass: false, reason: 'unexpected_error', errmsg: e.message };
  }
}

/**
 * Login a user via email and verification code
 * @param {string} email - The user's email
 * @param {string} email_salt - The salt paired with an email verify request
 * @param {string} code - The email code to be verified
 * @returns {Promise<Object>} result info
 */
async function login_via_email_and_verify(email, email_salt, code) {
  if (!email_salt || !code) {
    return { pass: false, reason: "missing_fields", errmsg: "salt and code required" };
  }

  const record = await database.getEmailRecordBySalt(email, email_salt);
  const expirationTime = EMAIL_VERIFY_EXPIRATION * 60 * 1000;
  const now = Date.now();

  if (!record || record.verified || (now - new Date(record.timestamp).getTime() > expirationTime)) {
    return { pass: false, reason: "invalid_or_expired", errmsg: "Invalid or expired verification request" };

  } else if (record.verification_code !== code) {
    return { pass: false, reason: "incorrect_code", errmsg: "Incorrect verification code" };

  } else {
    const [uid, newlyCreated] = await database.createOrMapUserWithEmail(record.email);
    return { pass: true, uid, email: record.email, displayName: record.email, newlyCreated };
  }
}

/**
 * Configures and enables OAuth2 authentication routes for the Express application.
 * It initializes Passport.js strategies, sets up the necessary `/oauth2/:provider` login endpoints,
 * and handles the `/oauth2/:provider/callback` endpoints to issue JWTs upon success.
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
        displayName: profile.displayName || profile.emails?.[0]?.value || profile.id,
        email: profile.emails?.[0]?.value,
        oauth2_sub: profile.id,
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
        displayName: profile.displayName || profile.username || profile.id,
        email: profile.emails?.[0]?.value,
        oauth2_sub: profile.id,
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
              provider, mappedProfile.oauth2_sub, mappedProfile
            );
            await grantTokenAsSetCookie(res, {...mappedProfile, provider, uid, newlyCreated});

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

EnableOAuth2Routes(app, OAUTH2_PROVIDERS.map(s => s.trim()).filter(Boolean));

app.post('/email', requirePoW, async (req, res) => {
  const salt = req.powSalt; /* passed by requirePoW */

  const ip_addr = req.headers['x-real-ip'] || req.ip || "127.0.0.1";
  const email = req.body.email || "";

  if (!email) {
    return res.status(400).json({ pass: false, reason: "email_required", errmsg: "Email is required" });
  }

  // Rate Limiting
  const { ipCount, emailCount } = await database.getEmailRecordCount(ip_addr, email, EMAIL_ATTEMPTS_SPAN);
  if (ipCount >= EMAIL_MAX_SEND_PER_IP) {
    const last = formatSpan(EMAIL_ATTEMPTS_SPAN);
    return res.status(429).json({
      pass: false,
      reason: "rate_limit_ip",
      last: last,
      errmsg: `Too many requests from this IP over the last ${last}.`
    });
  }
  if (emailCount >= EMAIL_MAX_SEND_PER_EMAIL) {
    const last = formatSpan(EMAIL_ATTEMPTS_SPAN);
    return res.status(429).json({
      pass: false,
      reason: "rate_limit_email",
      last: last,
      errmsg: `Too many requests from this IP to this email over the last ${last}.`
    });
  }

  // Send email with verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
  await database.storeEmailRecord(ip_addr, email, salt, code);
  const [success, error] = await email_verification_code(email, code);
  if (!success) {
    return res.status(500).json({
      pass: false,
      reason: "send_email_failed",
      errmsg: error
    });
  }

  return res.json({ pass: true, salt: salt });
});

app.post('/login', async (req, res) => {
  const ip_addr = req.headers['x-real-ip'] || req.ip || "127.0.0.1";
  const method = req.body.method;
  const email = req.body.email || "";

  let msg = {};

  if (method === 'email_and_password') {
    const password = req.body.password || "";
    msg = await login_via_email_and_password(ip_addr, email, password);

  } else if (method === 'email_verify') {
    const email_salt = req.body.email_salt; /* the salt paired with an email verify request */
    const code = req.body.code; /* the email code to be verified */
    msg = await login_via_email_and_verify(email, email_salt, code);

  } else {
    msg = { pass: false, reason: "invalid_method", errmsg: "Invalid method" };
  }

  if (msg.pass) {
    await grantTokenAsSetCookie(res, msg);
  }
  res.json(msg);
});

app.post('/change', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const method = req.body?.method;
  let msg = {};

  try {
    if (method === 'email') {
      const email = req.body?.email || "";
      if (!email) {
        msg = { pass: false, reason: "email_required", errmsg: "Email is required" };
      } else {
        await database.bindOrChangeEmail(uid, email);
        msg = { pass: true };
      }

    } else if (method === 'password') {
      const password = req.body?.password || "";
      if (!password) {
        msg = { pass: false, reason: "password_required", errmsg: "Password is required" };
      } else {
        await database.bindOrChangePassword(uid, password);
        msg = { pass: true };
      }

    } else if (method === 'oauth2') {
      const provider = req.user?.provider || "";
      const sub = req.user?.id || "";
      const info = req.user || {};

      if (!provider || !sub) {
        msg = {
          pass: false,
          reason: "oauth2_fields_required",
          errmsg: "OAuth2 provider and sub are required in current session"
        };
      } else {
        await database.bindOAuth2Account(uid, provider, sub, info);
        msg = { pass: true };
      }

    } else {
      msg = { pass: false, reason: "invalid_method", errmsg: "Invalid method" };
    }
  } catch (e) {
    msg = { pass: false, reason: "failed_to_change", errmsg: e.message };
  }

  res.json(msg);
});

app.get('/challenge', async (req, res) => {
  try {
    const { challenge, signature } = await generatePowChallenge();
    res.json({ challenge, signature });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate challenge" });
  }
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
