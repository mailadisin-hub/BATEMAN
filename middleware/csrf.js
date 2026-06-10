'use strict';

const Tokens = require('csrf');
const tokens = new Tokens();

/**
 * csrfProtection — session-backed CSRF protection.
 *
 * A per-session secret is lazily created and a fresh token derived from it is
 * exposed to every view via res.locals.csrfToken. State-changing requests
 * (POST/PUT/PATCH/DELETE) must supply that token in the `_csrf` body field or
 * the `x-csrf-token` header.
 */
function csrfProtection(req, res, next) {
  if (!req.session) {
    return next(new Error('CSRF protection requires a session'));
  }

  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }

  res.locals.csrfToken = tokens.create(req.session.csrfSecret);

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token =
    (req.body && req.body._csrf) ||
    req.headers['x-csrf-token'] ||
    req.headers['csrf-token'];

  if (!token || !tokens.verify(req.session.csrfSecret, token)) {
    const err = new Error('Invalid or missing CSRF token. Refresh the page and try again.');
    err.status = 403;
    return next(err);
  }

  return next();
}

module.exports = { csrfProtection };
