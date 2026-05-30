const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { AppError } = require('../utils/errors');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Support query parameter authentication for SSE (EventSource) connections
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Access token is required'));
    }

    jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'access_secret_key', async (err, decoded) => {
      if (err) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Access token is invalid or expired'));
      }

      // Fetch user from DB to verify existence and get latest role/org
      const userRes = await query(
        'SELECT id, email, name, role, organization_id FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userRes.rows.length === 0) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Authenticated user no longer exists'));
      }

      req.user = userRes.rows[0];
      next();
    });
  } catch (err) {
    next(err);
  }
};

module.exports = authenticateToken;
