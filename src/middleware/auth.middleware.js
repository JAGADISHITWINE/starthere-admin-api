const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Auth middleware verifies JWT from HttpOnly cookie or Authorization header.
 * If valid, attaches `req.user` and calls next(), otherwise returns 401.
 */
module.exports = function authMiddleware(req, res, next) {
  try {
    let token = null;

    // Prefer cookie-based token (HttpOnly)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // Fallback to Authorization header
    if (!token && req.headers && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1];
    }

    if (!token) return res.status(401).json({ response: false, message: 'Unauthorized' });

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not set');
      return res.status(500).json({ response: false, message: 'Server misconfiguration' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(401).json({ response: false, message: 'Invalid token' });
      req.user = decoded;
      next();
    });
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
};
