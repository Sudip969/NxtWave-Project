const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const validate = require('../middleware/validator');

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('must be a valid email address'),
    body('password').isLength({ min: 6 }).withMessage('must be at least 6 characters long'),
    body('name').notEmpty().withMessage('is required'),
    body('organizationName').notEmpty().withMessage('is required'),
    body('role').optional().isIn(['ADMIN', 'MANAGER', 'MEMBER']).withMessage('must be ADMIN, MANAGER, or MEMBER')
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('must be a valid email address'),
    body('password').notEmpty().withMessage('is required')
  ],
  validate,
  authController.login
);

router.post(
  '/refresh',
  [
    body('refreshToken').notEmpty().withMessage('is required')
  ],
  validate,
  authController.refresh
);

router.post(
  '/logout',
  [
    body('refreshToken').notEmpty().withMessage('is required')
  ],
  validate,
  authController.logout
);

const authenticateToken = require('../middleware/auth');

router.get('/users', authenticateToken, authController.getUsers);

module.exports = router;
