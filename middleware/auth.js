'use strict';

/**
 * requireAuth — protects dashboard and API routes.
 * Redirects to /login if no authenticated session exists.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  // Preserve intended destination for post-login redirect
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

/**
 * requireGuest — prevents authenticated users from accessing the login page.
 * Redirects to /dashboard if a session already exists.
 */
function requireGuest(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { requireAuth, requireGuest };
