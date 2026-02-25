const jwt = require('jsonwebtoken');
const express = require('express');
const cookieParser = require('cookie-parser');
const database = require('./database');
const passhash = require('./passhash');

// Configuration
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5");
const LOGIN_ATTEMPTS_SPAN = parseInt(process.env.LOGIN_MAX_TIMESPAN || (24 * 60).toString()); // minutes
const JWT_EXPIRE_DAYS = parseInt(process.env.JWT_EXPIRE_DAYS || "1");

/**
 * Login a user
 * @param {string} ipAddress - The IP address of the requester
 * @param {string} email - The user's email
 * @param {string} password - The password provided
 * @param {boolean} debug - Debug mode flag
 * @returns {Promise<[boolean, Object]>} [success, result/error info]
 */
async function login_via_email_and_password(ipAddress, email, password, debug = false) {
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
      const now = Math.floor(Date.now() / 1000);
      const durationSeconds = debug ? 10 : JWT_EXPIRE_DAYS * 24 * 60 * 60;

      const exp = now + durationSeconds;
      const info = {
        exp: exp,
        maxAge: durationSeconds,
        loggedInAs: email,
        uid: user.uid,
        scope: ["/*"]
      };

      const jwtSecret = await database.getJwtSecret();
      const token = jwt.sign(info, jwtSecret, { algorithm: "HS256" });

      await database.storeLoginAttempt(ipAddress, uid, true);
      return [true, {
        pass: true,
        info: info,
        algorithm: { algorithm: "HS256" },
        token: token
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

// --- HTTP Server (Daemon) ---

const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || "jwt";
const PORT = parseInt(process.env.PORT || "19721", 10);

app.post('/authorization', async (req, res) => {
  const token = req.body.token || "";
  const [pass_check, msg] = await verify(token);
  res.json({ pass: pass_check, msg: msg });
});

app.post('/authentication', async (req, res) => {
  const username = req.body.username || "";
  const password = req.body.password || "";
  const debug = req.body.debug || false;

  const ip_addr = req.headers['x-real-ip'] || req.ip || "127.0.0.1";

  const [pass_check, msg] = await login_via_email_and_password(ip_addr, username, password, debug);

  if (pass_check) {
    res.cookie(JWT_COOKIE_NAME, msg.token, {
      maxAge: msg.info.maxAge * 1000, // Express maxAge is in milliseconds
      httpOnly: true // ask the browser to hide it from JavaScript
    });
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
