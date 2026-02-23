import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// Fail fast if required environment variables are missing
if (!process.env.SESSION_SECRET) {
  throw new Error('FATAL: SESSION_SECRET environment variable is not set.');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('FATAL: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variable is not set.');
}
if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  throw new Error('FATAL: GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variable is not set.');
}

// Minimal session and passport setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/oauth2/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    // In a real app, you'd find or create a user in your database here
    return done(null, profile);
  }
));

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "/oauth2/github/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    // In a real app, you'd find or create a user in your database here
    return done(null, profile);
  }
));

// Auth routes
app.get('/oauth2/google', (req, res, next) => {
  console.log('Initiating Google OAuth2 for action:', req.query.action);
  const { action } = req.query;
  const state = action ? Buffer.from(JSON.stringify({ action })).toString('base64') : undefined;
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

app.get('/oauth2/google/callback',
  passport.authenticate('google', { failureRedirect: './#/login' }),
  (req, res) => {
    // Decode state to get the original action if needed
    let redirectPath = './#/';
    if (req.query.state) {
      try {
        const state = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
        if (state.action) redirectPath = `./#/${state.action}`;
      } catch (e) {}
    }
    res.redirect(redirectPath);
  }
);

app.get('/oauth2/github', (req, res, next) => {
  console.log('Initiating GitHub OAuth2 for action:', req.query.action);
  const { action } = req.query;
  const state = action ? Buffer.from(JSON.stringify({ action })).toString('base64') : undefined;
  passport.authenticate('github', { scope: ['user:email'], state })(req, res, next);
});

app.get('/oauth2/github/callback',
  passport.authenticate('github', { failureRedirect: './#/login' }),
  (req, res) => {
    // Decode state to get the original action if needed
    let redirectPath = './#/';
    if (req.query.state) {
      try {
        const state = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
        if (state.action) redirectPath = `./#/${state.action}`;
      } catch (e) {}
    }
    res.redirect(redirectPath);
  }
);

app.use(express.static(join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`UI Login Microservice listening on port ${port}`);
});
