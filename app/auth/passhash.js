const argon2 = require('argon2');

/**
 * Hashes a password using Argon2.
 * @param {string} password The password to hash.
 * @returns {Promise<string>} The hashed password.
 */
async function hashPassword(password) {
  try {
    return await argon2.hash(password);
  } catch (err) {
    throw new Error(`Hashing failed: ${err.message}`);
  }
}

/**
 * Verifies a password against a hash using Argon2.
 * @param {string} hashed The hashed password.
 * @param {string} password The password to verify.
 * @returns {Promise<boolean>} True if the password matches, false otherwise.
 */
async function verifyPassword(hashed, password) {
  try {
    return await argon2.verify(hashed, password);
  } catch (err) {
    // Return false on verification errors (e.g., invalid hash format)
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword
};
