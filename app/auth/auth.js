const jwt = require('jsonwebtoken');
const database = require('./database');
const passhash = require('./passhash');

// Configuration
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5");
const LOGIN_MAX_TIMESPAN = parseInt(process.env.LOGIN_MAX_TIMESPAN || (24 * 60).toString()); // minutes
const JWT_EXPIRE_DAYS = parseInt(process.env.JWT_EXPIRE_DAYS || "1");

/**
 * Login a user
 * @param {string} ipAddress - The IP address of the requester
 * @param {string} email - The user's email
 * @param {string} password - The password provided
 * @param {boolean} debug - Debug mode flag
 * @returns {Promise<[boolean, Object]>} [success, result/error info]
 */
async function login(ipAddress, email, password, debug = false) {
  console.log(`[login user] ${email}`);

  let errmsg = "Wrong password.";
  let leftChances = 0;

  try {
    // 1. Check Brute Force Protection
    // We need the UID to check user-specific failures, but we don't have it yet.
    // However, the database.getLoginAttempts needs a UID to filter by user.
    // Let's resolve the user first to get the UID, but strictly for the purpose of checking logs.
    // If the user doesn't exist, we pass null to getLoginAttempts (checking IP only).
    
    // Note: This creates a slight timing attack vector (checking user existence), 
    // but the original Python code did `db.get_login_attempts` BEFORE `db.get_user`.
    // In the new DB schema, we need the UID for the log.
    // Let's optimize: We try to get the user object first.
    
    const user = await database.getUser(email);
    const uid = user ? user.uid : null;

    const [consecFails, attempts] = await database.getLoginAttempts(ipAddress, uid, LOGIN_MAX_TIMESPAN);
    
    console.log(`[login] email=${email}, uid=${uid}, consec_fails=${consecFails}.`);
    // console.log('[attempts]', attempts); // Verbose logging

    leftChances = Math.max(LOGIN_MAX_ATTEMPTS - consecFails - 1, 0);
    if (leftChances === 0) {
      throw new Error(`Too many login attempts. (User, IP) is locked out!`);
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
        uid: user.uid, // Added uid to token for reference
        scope: ["/*"]
      };

      const jwtSecret = await database.getJwtSecret();
      const token = jwt.sign(info, jwtSecret, { algorithm: "HS256" });

      await database.storeLoginAttempt(ipAddress, uid, true);
      
      return [true, {
        info: info,
        algorithm: { algorithm: "HS256" },
        token: token
      }];

    } else {
      // Failure logic
      await database.storeLoginAttempt(ipAddress, uid, false);
    }

  } catch (e) {
    console.log(`Login error: ${e.message}`);
    errmsg = e.message;
  }

  return [false, { errmsg: errmsg, left_chances: leftChances }];
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
    if (err.name === 'TokenExpiredError') {
      return [false, "Token has expired."];
    }
    return [false, err.message];
  }
}

// Main execution block for CLI testing
if (require.main === module) {
  const { program } = require('commander');

  program
    .description('Lattice Authentication Tool')
    .option('--ip <ip>', 'IP address', '127.0.0.1')
    .option('--user <user>', 'Email/Username', 'admin@lattice.local')
    .option('--password <password>', 'Password', 'changeme!')
    .parse(process.argv);

  const options = program.opts();

  (async () => {
    try {
      const [successful, result] = await login(options.ip, options.user, options.password);
      console.log('[successful?]', successful, result);

      if (successful) {
        const [verifyRes, verifyPayload] = await verify(result.token);
        console.log('[verify]', verifyRes, verifyPayload);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      // Ensure DB connection closes if opened by the login check
      await database.db.destroy();
    }
  })();
}

module.exports = {
  login,
  verify
};
