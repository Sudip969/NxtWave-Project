const express = require('express');
const { body } = require('express-validator');
const projectController = require('../controllers/projectController');
const authenticateToken = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const validate = require('../middleware/validator');

const router = express.Router();

router.use(authenticateToken);

router.post(
  '/',
  requireRole(['ADMIN', 'MANAGER']),
  [
    body('name').notEmpty().withMessage('is required')
  ],
  validate,
  projectController.createProject
);

router.get('/', projectController.getProjects);

module.exports = router;
