const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generate, solve, verify } = require('busybot');
const database = require('./database');

// Configuration
const POW_EXP_MINUTES = 1;
const POW_DIFFICULTY = parseInt(process.env.POW_DIFFICULTY || "100");
const MERSENNE_EXPONENT = 4253;

// Cache for salt of ALREADY USED challenges to prevent replay.
// We only store used ones, so memory usage is limited by the rate at
// which users can actually solve the puzzles.
const spentSalts = new Set();

/**
 * Generate a signed PoW challenge
 * @returns {Promise<Object>} { challenge, signature }
 */
async function generateChallenge() {
  const challenge = await generate({
    forMersenneExponent: MERSENNE_EXPONENT,
    withDifficulty: POW_DIFFICULTY
  });

  const salt = crypto.randomBytes(16).toString('hex');
  const secret = await database.getJwtSecret();

  // Sign the challenge and a salt
  const signature = jwt.sign({
    salt: salt,
    challenge: challenge,
    exp: Math.floor(Date.now() / 1000) + (POW_EXP_MINUTES * 60)
  }, secret, { algorithm: 'HS256' });

  return { challenge, signature };
}

/**
 * Verify a PoW solution and prevent replay
 * @param {Object} challenge
 * @param {string} signature
 * @param {any} solution
 * @returns {Promise<boolean>}
 */
async function verifySolution(challenge, signature, solution) {
  try {
    const secret = await database.getJwtSecret();

    // 1. Verify the signature and expiration
    const decoded = jwt.verify(signature, secret, { algorithms: ['HS256'] });

    // 2. Check if this specific challenge instance was already used (Replay Protection)
    if (spentSalts.has(decoded.salt)) {
      return false;
    }

    // 3. Ensure the challenge matches the signature
    if (JSON.stringify(decoded.challenge) !== JSON.stringify(challenge)) {
      return false;
    }

    // 4. Verify the mathematical solution
    const isValid = await verify(challenge, solution);

    if (isValid) {
      // Mark as used. We only store the salt IF the solution was actually correct.
      // This protects memory from being filled with cheap DoS.
      spentSalts.add(decoded.salt);

      // Schedule removal from cache after the token would have expired anyway
      setTimeout(() => spentSalts.delete(decoded.salt), POW_EXP_MINUTES * 60 * 1000);
    }

    return isValid;

  } catch (err) {
    return false;
  }
}

module.exports = {
  generateChallenge,
  verifySolution
};

if (require.main === module) {
  const { program } = require('commander');
  program
    .option('-d, --difficulty <number>', 'PoW difficulty', POW_DIFFICULTY)
    .option('-e, --exponent <number>', 'Mersenne exponent', MERSENNE_EXPONENT)
    .parse(process.argv);

  const options = program.opts();
  const diff = parseInt(options.difficulty);
  const exp = parseInt(options.exponent);

  (async () => {
    console.log(`--- PoW Performance Test ---`);
    console.log(`Difficulty: ${diff}`);
    console.log(`Exponent:   ${exp}`);
    console.log(`----------------------------`);

    // 1. Generation
    const startGen = Date.now();
    const challenge = await generate({ forMersenneExponent: exp, withDifficulty: diff });
    console.log(`Gen time:    ${Date.now() - startGen}ms`);

    // 2. Solving (Simulating Client Side)
    console.log(`Solving (Client Side)...`);
    const startSolve = Date.now();
    const solution = await solve(challenge);
    const solveTime = Date.now() - startSolve;
    console.log(`Solve time:  ${solveTime}ms`);

    // 3. Verification (Server Side)
    const startVerify = Date.now();
    const isValid = await verify(challenge, solution);
    console.log(`Verify time: ${Date.now() - startVerify}ms`);
    console.log(`Is Valid:    ${isValid}`);
  })();
}
