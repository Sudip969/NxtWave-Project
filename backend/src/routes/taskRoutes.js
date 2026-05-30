const express = require('express');
const { body } = require('express-validator');
const taskController = require('../controllers/taskController');
const authenticateToken = require('../middleware/auth');
const { requireRole, scopeTaskList, requireTaskAccess } = require('../middleware/authorize');
const validate = require('../middleware/validator');

const router = express.Router();

router.use(authenticateToken);

// CREATE Task (ADMIN and MANAGER only)
router.post(
  '/',
  requireRole(['ADMIN', 'MANAGER']),
  [
    body('title').notEmpty().withMessage('is required'),
    body('projectId').notEmpty().withMessage('is required'),
    body('dueDate').optional().custom((value) => {
      if (value) {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          throw new Error('must be a valid date');
        }
        if (d < new Date()) {
          throw new Error('must be a future date');
        }
      }
      return true;
    })
  ],
  validate,
  taskController.createTask
);

// LIST Tasks (all users, but MEMBERS scoped automatically to their own tasks)
router.get('/', scopeTaskList, taskController.getTasks);

// GET Single Task Details (scoped by multi-tenant org and role view rules)
router.get('/:id', requireTaskAccess('view'), taskController.getTaskById);

// UPDATE Task (dynamic RBAC check based on body fields)
const determineUpdateAccess = (req, res, next) => {
  const { title, description, priority, dueDate, assigneeId } = req.body;
  const hasFieldChanges = title !== undefined || description !== undefined || priority !== undefined || dueDate !== undefined || assigneeId !== undefined;
  
  if (hasFieldChanges) {
    // Requires ADMIN/MANAGER permissions
    return requireTaskAccess('update')(req, res, next);
  } else {
    // Status update only, requires Assignee or ADMIN/MANAGER permissions
    return requireTaskAccess('update_status')(req, res, next);
  }
};

router.patch(
  '/:id',
  determineUpdateAccess,
  [
    body('dueDate').optional().custom((value) => {
      if (value) {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          throw new Error('must be a valid date');
        }
        if (d < new Date()) {
          throw new Error('must be a future date');
        }
      }
      return true;
    })
  ],
  validate,
  taskController.updateTask
);

// DELETE Task (ADMIN/MANAGER only)
router.delete('/:id', requireTaskAccess('delete'), taskController.deleteTask);

module.exports = router;
