const { program } = require('commander');
const knex = require('knex');
const crypto = require('crypto');
const passhash = require('./passhash');

// Database configuration
const DB_URL = process.env.DB_URL || "postgresql://postgres:postgres@localhost/postgres";

const db = knex({
  client: 'pg',
  connection: DB_URL,
  pool: { min: 2, max: 10 }
});

// Helper to get current UTC timestamp
const now = () => new Date().toISOString();

/**
 * Initialize database schema
 * @param {boolean} reset - Whether to drop tables before creating
 */
async function initializeDB(reset = false) {
  try {
    if (reset) {
      console.log("Cleaning up and resetting database schema...");
      await db.schema.dropTableIfExists('AuthJwtConfig');
      await db.schema.dropTableIfExists('AuthRecord');
      await db.schema.dropTableIfExists('AuthEmail');
      await db.schema.dropTableIfExists('AuthOAuth2');
      await db.schema.dropTableIfExists('AuthPassword');
      await db.schema.dropTableIfExists('AuthUser');
    }

    console.log("Creating database tables...");

    // AuthUser table
    if (!(await db.schema.hasTable('AuthUser'))) {
      await db.schema.createTable('AuthUser', (table) => {
        table.increments('uid').primary(); // Primary Key
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('last_active').defaultTo(db.fn.now());
      });
    }

    // AuthPassword table
    if (!(await db.schema.hasTable('AuthPassword'))) {
      await db.schema.createTable('AuthPassword', (table) => {
        table.integer('uid').references('uid').inTable('AuthUser').onDelete('CASCADE').primary();
        table.string('hashed_password', 255).notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('modified_at').defaultTo(db.fn.now());
      });
    }

    // AuthOAuth2 table
    if (!(await db.schema.hasTable('AuthOAuth2'))) {
      await db.schema.createTable('AuthOAuth2', (table) => {
        table.integer('uid').references('uid').inTable('AuthUser').onDelete('CASCADE');
        table.string('provider', 32).notNullable();
        table.string('sub', 255).notNullable();
        table.jsonb('info').defaultTo('{}');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.primary(['provider', 'sub']); // Composite primary key
      });
    }

    // AuthEmail table
    if (!(await db.schema.hasTable('AuthEmail'))) {
      await db.schema.createTable('AuthEmail', (table) => {
        /* we want one-to-one UID and email, hence `.unique()` here */
        table.integer('uid').references('uid').inTable('AuthUser').onDelete('CASCADE').unique();
        table.string('email', 255).primary();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('modified_at').defaultTo(db.fn.now());
      });
    }

    // AuthRecord table
    if (!(await db.schema.hasTable('AuthRecord'))) {
      await db.schema.createTable('AuthRecord', (table) => {
        table.increments('id').primary();
        table.string('ip_address', 45).notNullable(); // IPv6 length
        table.integer('uid').references('uid').inTable('AuthUser').onDelete('CASCADE').nullable();
        table.boolean('successful').notNullable();
        table.timestamp('timestamp').defaultTo(db.fn.now());

        // Indexes for efficient lookups
        table.index(['ip_address', 'uid']);
        table.index(['uid']);
        table.index(['timestamp']); // Useful for time-based cleanup/queries
      });
    }

    // AuthJwtConfig table
    if (!(await db.schema.hasTable('AuthJwtConfig'))) {
      await db.schema.createTable('AuthJwtConfig', (table) => {
        table.string('key', 64).primary();
        table.text('value').notNullable();
        table.timestamp('modified_at').defaultTo(db.fn.now());
      });
    }

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
    process.exit(1);
  }
}

/**
 * Create or map a user (with only email)
 * @param {string} email
 * @returns {Promise<[number, boolean]>} [uid, newly_created]
 */
async function createOrMapUserWithEmail(email) {
  const trx = await db.transaction();
  try {
    const existing = await trx('AuthEmail').where({ email }).first();
    if (existing) {
      await trx.commit();
      return [existing.uid, false];
    }

    const [user] = await trx('AuthUser').insert({
      created_at: now(),
      last_active: now()
    }).returning('uid');

    await trx('AuthEmail').insert({
      uid: user.uid,
      email: email,
      created_at: now(),
      modified_at: now()
    });

    await trx.commit();
    return [user.uid, true];

  } catch (err) {
    await trx.rollback();
    throw new Error(`Error creating/mapping user: ${err.message}`);
  }
}

/**
 * Create or map a user (with OAuth2 info)
 * @param {string} provider
 * @param {string} sub
 * @param {Object} info
 * @returns {Promise<[number, boolean]>} [uid, newly_created]
 */
async function createOrMapUserWithOauth2(provider, sub, info) {
  const trx = await db.transaction();
  try {
    const existing = await trx('AuthOAuth2').where({ provider, sub }).first();
    if (existing) {
      await trx.commit();
      return [existing.uid, false];
    }

    const [user] = await trx('AuthUser').insert({
      created_at: now(),
      last_active: now()
    }).returning('uid');

    await trx('AuthOAuth2').insert({
      uid: user.uid,
      provider,
      sub,
      info,
      created_at: now()
    });

    await trx.commit();
    return [user.uid, true];

  } catch (err) {
    await trx.rollback();
    throw new Error(`Error creating/mapping user with OAuth2: ${err.message}`);
  }
}

/**
 * Bind or change password for a user by UID
 * @param {number} uid
 * @param {string} password
 */
async function bindOrChangePassword(uid, password) {
  try {
    const hashedPassword = await passhash.hashPassword(password);

    // Upsert password
    await db('AuthPassword')
      .insert({
        uid: uid,
        hashed_password: hashedPassword,
        created_at: now(),
        modified_at: now()
      })
      .onConflict('uid')
      .merge({
        hashed_password: hashedPassword,
        modified_at: now()
      });

  } catch (err) {
    throw new Error(`Error changing password: ${err.message}`);
  }
}

/**
 * Bind or change email for a user by UID
 * @param {number} uid
 * @param {string} email
 */
async function bindOrChangeEmail(uid, email) {
  try {
    await db('AuthEmail')
      .insert({
        uid: uid,
        email: email,
        created_at: now(),
        modified_at: now()
      })
      .onConflict('uid')
      .merge({
        email: email,
        modified_at: now()
      });
  } catch (err) {
    throw new Error(`Error binding/changing email: ${err.message}`);
  }
}

/**
 * Bind an OAuth2 account to a user
 * @param {number} uid
 * @param {string} provider
 * @param {string} sub
 * @param {Object} info
 */
async function bindOAuth2Account(uid, provider, sub, info = {}) {
  try {
    const existing = await db('AuthOAuth2').where({ provider, sub }).first();
    if (existing) {
      throw new Error(`OAuth2 account with ${provider}/${sub} is already registered.`);
    }

    await db('AuthOAuth2').insert({
      uid: uid,
      provider: provider,
      sub: sub,
      info: info,
      created_at: now()
    });
  } catch (err) {
    throw new Error(`Error binding OAuth2 account: ${err.message}`);
  }
}

/**
 * Get user by a specific field.
 * Common usages:
 * - By Email: getUserBy('AuthEmail.email', 'user@example.com')
 * - By OAuth2 Sub: getUserBy('AuthOAuth2.sub', 'google-oauth2|123456')
 *
 * @param {string} field - The database field to search by
 * @param {string|number} value - The value to search for
 * @returns {Promise<Object|undefined>} User object joined with email and oauth info
 */
async function getUserBy(field, value) {
  try {
    return await db('AuthUser')
      .leftJoin('AuthEmail', 'AuthUser.uid', 'AuthEmail.uid')
      .leftJoin('AuthPassword', 'AuthUser.uid', 'AuthPassword.uid')
      .leftJoin('AuthOAuth2', 'AuthUser.uid', 'AuthOAuth2.uid')
      .where(field, value)
      .select(
        'AuthUser.uid',
        'AuthUser.created_at',
        'AuthUser.last_active',
        'AuthEmail.email',
        'AuthPassword.hashed_password',
        'AuthOAuth2.sub as oauth2_sub'
      )
      .first();
  } catch (err) {
    throw new Error(`Error fetching user: ${err.message}`);
  }
}

/**
 * Store login attempt
 * @param {string} ip_address
 * @param {number|null} uid - User ID if known, null otherwise
 * @param {boolean} success
 */
async function storeLoginAttempt(ip_address, uid, success) {
  try {
    await db('AuthRecord').insert({
      ip_address,
      uid, // Can be null if user not found
      successful: success,
      timestamp: now()
    });

    // Update last_active if successful and user exists
    if (success && uid) {
        await db('AuthUser').where({ uid }).update({ last_active: now() });
    }
  } catch (err) {
    console.error("Error storing login attempt:", err);
  }
}

/**
 * Get login attempts
 * @param {string|null} ip_address
 * @param {number|null} uid
 * @param {number} max_minutes
 * @returns {Promise<[number, Array]>} [consecutive_failures, records]
 */
async function getLoginAttempts(ip_address, uid, max_minutes) {
  if (max_minutes <= 0) {
    throw new Error("max_minutes must be greater than 0");
  }
  try {
    const since = new Date(Date.now() - max_minutes * 60 * 1000).toISOString();
    let query = db('AuthRecord').where('timestamp', '>=', since);
    if (ip_address) {
      query = query.where('ip_address', ip_address);
    }
    if (uid) {
      query = query.where('uid', uid);
    }
    const records = await query.orderBy('timestamp', 'desc');

    let consec_fails = 0;
    for (const record of records) {
      if (record.successful) {
        break;
      }
      consec_fails += 1;
    }
    return [consec_fails, records];

  } catch (err) {
    console.error("Error getting login attempts:", err);
    return [0, []];
  }
}

/**
 * Rotate JWT Secret
 * @returns {Promise<string>} New secret
 */
async function rotateJwtSecret() {
  const newSecret = crypto.randomBytes(2048).toString('hex');
  try {
    await db('AuthJwtConfig')
      .insert({
        key: 'jwt_secret',
        value: newSecret,
        modified_at: now()
      })
      .onConflict('key')
      .merge({
        value: newSecret,
        modified_at: now()
      });
    return newSecret;

  } catch (err) {
    throw new Error(`Error rotating JWT secret: ${err.message}`);
  }
}

/**
 * Get JWT Secret
 * @returns {Promise<string>} Secret
 */
async function getJwtSecret() {
  try {
    const config = await db('AuthJwtConfig').where({ key: 'jwt_secret' }).first();
    if (config) {
      return config.value;
    }
    return await rotateJwtSecret();

  } catch (err) {
    console.error("Error getting JWT secret:", err);
    throw err;
  }
}

// Main execution block
if (require.main === module) {
  const avail_fields = '[AuthUser.uid, AuthEmail.email, AuthOAuth2.sub]'
  program
    .arguments('[args...]')
    .option('--reset', 'Reset and then initialize database (with an admin)')
    .option('--lookup-user-by', `Lookup user by any of ${avail_fields} and ID`)
    .option('--bind-or-change-password', 'Bind or change password for user by email')
    .option('--change-email', 'Bind or change email for user by email')
    .option('--bind-oauth', 'Bind an OAuth2 account to user by email')
    .option('--verify-email-and-password', 'Verify email and password')
    .option('--rotate-jwt', 'Rotate the JWT secret')
    .parse(process.argv);

  const options = program.opts();
  const emailize = (name) => {
    if (name.includes('@')) {
      return name;
    } else {
      return `${name}@${name}.local`;
    }
  };

  // We need to handle async execution in top-level
  (async () => {
    try {
      if (options.reset) {
        await initializeDB(true);

        /* create admin */
        const [adminUid] = await createOrMapUserWithEmail(emailize('admin'));
        await bindOrChangePassword(adminUid, 'changeme!');

        /* for test: bind oauth account */
        await bindOAuth2Account(adminUid, 'local', 'foreign-admin', {'age': 20});

        /* for test: a user without a password (only verified email) */
        await createOrMapUserWithEmail(emailize('no_password_user'));

        /* for test: a user without a password (only through OAuth2) */
        const [testUid] = await createOrMapUserWithOauth2('local', 'oauth_only_user', {'age': 30});

        /* for test: bind email */
        await bindOrChangeEmail(testUid, 'oauth_only_user@bind_mail.local');

      } else if (options.lookupUserBy) {
        const [field, id] = program.args;
        if (!field || !id) {
           console.error("Error: Please provide field and ID arguments.");
           process.exit(1);
        }
        const user = await getUserBy(field, id);
        if (user) {
          console.log('[found user]', user);
        } else {
          console.log("User not found.");
        }

      } else if (options.bindOrChangePassword) {
        const [email, password] = program.args;
        if (!email || !password) {
           console.error("Error: Please provide email and password arguments.");
           process.exit(1);
        }
        const user = await getUserBy('AuthEmail.email', emailize(email));
        if (!user) {
            console.error(`User ${email} not found.`);
            process.exit(1);
        }
        await bindOrChangePassword(user.uid, password);

      } else if (options.changeEmail) {
        const [email, newEmail] = program.args;
        if (!email || !newEmail) {
           console.error("Error: Please provide current email and new email arguments.");
           process.exit(1);
        }
        const user = await getUserBy('AuthEmail.email', emailize(email));
        if (!user) { console.error(`User ${email} not found.`); process.exit(1); }
        await bindOrChangeEmail(user.uid, emailize(newEmail));

      } else if (options.bindOauth) {
        const [email, provider, sub] = program.args;
        if (!email || !provider || !sub) {
           console.error("Error: Please provide email, provider, and sub arguments.");
           process.exit(1);
        }
        const user = await getUserBy('AuthEmail.email', emailize(email));
        if (!user) { console.error(`User ${email} not found.`); process.exit(1); }
        await bindOAuth2Account(user.uid, provider, sub);

      } else if (options.verifyEmailAndPassword) {
        const [email, password] = program.args;
        if (!email || !password) {
           console.error("Error: Please provide email and password arguments.");
           process.exit(1);
        }
        const user = await getUserBy('AuthEmail.email', emailize(email));

        if (user) {
          console.log('[found user]', user)
          let successful = false;
          if (user.hashed_password) {
            successful = await passhash.verifyPassword(user.hashed_password, password);
            console.log('verify successful?', successful);
          } else {
            console.log("User has no password set (OAuth2 only?)");
          }
          await storeLoginAttempt("127.0.0.1", user.uid, successful);
        } else {
          await storeLoginAttempt("127.0.0.1", null, false);
          console.log("User not found.");
        }

        const N = 5;
        const [attempts, records] = await getLoginAttempts("127.0.0.1", user ? user.uid : null, N);
        console.log(`Failed consecutive attempts in last ${N} mins: ${attempts}`);
        console.log(records)

      } else if (options.rotateJwt) {
        const newSecret = await rotateJwtSecret();
        const secret = await getJwtSecret();
        if (newSecret !== secret) {
          throw new Error("Consistency check failed!");
        } else {
          console.log(`New secret: ${secret.substring(0, 5)}...`);
        }

      } else {
        program.help();
      }

    } catch (err) {
        console.error("An unexpected error occurred:", err);
    } finally {
        await db.destroy();
    }

  })(); /* end top-level async */
} /* end main module */
