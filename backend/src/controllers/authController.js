const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { AppError } = require('../utils/errors');

const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, organizationId: user.organization_id, role: user.role },
    process.env.JWT_ACCESS_SECRET || 'access_secret_key',
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET || 'refresh_secret_key',
    { expiresIn: '7d' }
  );
};

const register = async (req, res, next) => {
  try {
    const { email, password, name, role, organizationName } = req.body;

    if (!email || !password || !name || !organizationName) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'All fields (email, password, name, organizationName) are required'));
    }

    // Check if user already exists
    const userCheck = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'A user with this email already exists'));
    }

    // Find or create organization
    let orgId;
    const orgCheck = await query('SELECT id FROM organizations WHERE name = $1', [organizationName]);
    if (orgCheck.rows.length > 0) {
      orgId = orgCheck.rows[0].id;
    } else {
      const newOrg = await query(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
        [organizationName]
      );
      orgId = newOrg.rows[0].id;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Validate role, defaulting to MEMBER
    const finalRole = ['ADMIN', 'MANAGER', 'MEMBER'].includes(role) ? role : 'MEMBER';

    // Insert user
    const userInsert = await query(
      `INSERT INTO users (email, password_hash, name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, organization_id, created_at`,
      [email, passwordHash, name, finalRole, orgId]
    );

    const user = userInsert.rows[0];

    res.status(201).json({
      status: 201,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organization_id,
          createdAt: user.created_at
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Email and password are required'));
    }

    // Fetch user and organization details
    const userRes = await query(
      `SELECT u.*, o.name as organization_name 
       FROM users u 
       JOIN organizations o ON u.organization_id = o.id 
       WHERE u.email = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid email or password'));
    }

    const user = userRes.rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid email or password'));
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token to DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [refreshToken, user.id, expiresAt]
    );

    res.status(200).json({
      status: 200,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organization_id,
          organizationName: user.organization_name
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Refresh token is required'));
    }

    // Find token in DB
    const tokenRes = await query('SELECT * FROM refresh_tokens WHERE token = $1', [refreshToken]);
    
    if (tokenRes.rows.length === 0) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token'));
    }

    const dbToken = tokenRes.rows[0];

    // Active Replay Attack Protection:
    // If token is already revoked, it suggests someone is trying to reuse a stolen refresh token.
    // As a strict security measure, revoke ALL tokens for this user.
    if (dbToken.revoked) {
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [dbToken.user_id]);
      return next(new AppError(401, 'UNAUTHORIZED', 'Refresh token has been reused. All user sessions revoked.'));
    }

    // Check expiration
    if (new Date(dbToken.expires_at) < new Date()) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Refresh token has expired'));
    }

    // Fetch user
    const userRes = await query('SELECT * FROM users WHERE id = $1', [dbToken.user_id]);
    if (userRes.rows.length === 0) {
      return next(new AppError(401, 'UNAUTHORIZED', 'User not found'));
    }
    const user = userRes.rows[0];

    // Revoke the old refresh token
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [dbToken.id]);

    // Generate new pair
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Save new refresh token
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    await query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [newRefreshToken, user.id, newExpiresAt]
    );

    res.status(200).json({
      status: 200,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Refresh token is required'));
    }

    // Revoke the refresh token
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1', [refreshToken]);

    res.status(200).json({
      status: 200,
      message: 'Logged out successfully'
    });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    const usersRes = await query(
      'SELECT id as user_id, name as user_name, email as user_email FROM users WHERE organization_id = $1 ORDER BY name ASC',
      [orgId]
    );
    res.status(200).json({
      status: 200,
      data: { 
        users: usersRes.rows,
        overdueTasksPerUser: usersRes.rows 
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getUsers
};
