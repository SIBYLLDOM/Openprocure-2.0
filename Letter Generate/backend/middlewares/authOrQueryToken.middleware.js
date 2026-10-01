const jwt = require('jsonwebtoken');

/**
 * Same as auth.middleware, but also accepts the token as ?token=... — for
 * routes opened via a plain browser navigation (e.g. window.open/<a target
 * ="_blank">) which can't attach an Authorization header. Header still wins
 * when both are present. Keep this off of any route more sensitive than
 * "serves a file the user is already authorized to view" — a query-string
 * token can end up in server logs / browser history.
 */
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = headerToken || req.query.token;

  if (!token) {
    return res.status(401).json({ message: 'Authorization token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
