const { query } = require('../config/db');
const { AppError } = require('../utils/errors');

// Check standard role access
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication context missing'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied. Insufficient role permissions.'));
    }
    next();
  };
};

// Middleware to automatically restrict task filters based on user role
const scopeTaskList = (req, res, next) => {
  if (!req.user) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication context missing'));
  }
  next();
};

// Middleware to enforce task authorization boundaries for single tasks (GET, PATCH, DELETE)
const requireTaskAccess = (action) => {
  return async (req, res, next) => {
    try {
      const taskId = req.params.id;
      if (!taskId) {
        return next(new AppError(400, 'VALIDATION_ERROR', 'Task ID parameter is required'));
      }

      console.log('--- DEBUG: requireTaskAccess Triggered ---');
      console.log(`Action: ${action}, Task ID: ${taskId}`);

      // Fetch task details along with its project's organization to ensure strict data scoping
      const taskRes = await query(
        `SELECT t.*, p.organization_id 
         FROM tasks t 
         LEFT JOIN projects p ON t.project_id = p.id 
         WHERE t.id = $1`,
        [taskId]
      );

      console.log(`Task Query length: ${taskRes.rows.length}`);

      if (taskRes.rows.length === 0) {
        console.error(`ERROR: Task ${taskId} not found in DB`);
        return next(new AppError(404, 'NOT_FOUND', 'Task not found'));
      }

      const task = taskRes.rows[0];
      console.log(`Task fetched organization_id: ${task.organization_id}`);

      // Multi-tenant check: User's organization must match the task project's organization
      if (task.organization_id !== req.user.organization_id) {
        console.error(`ERROR: Org mismatch. User org: ${req.user.organization_id}, Task org: ${task.organization_id}`);
        return next(new AppError(403, 'FORBIDDEN', 'Access denied. Resource belongs to another organization.'));
      }

      // Pre-populate targetTask immediately so it is ALWAYS available downstream
      req.targetTask = task;
      console.log('Successfully pre-populated req.targetTask');

      const isManagerOrAdmin = req.user.role === 'MANAGER' || req.user.role === 'ADMIN';

      if (action === 'view') {
        console.log('Action is view. Proceeding via next() early exit.');
        next();
        return;
      } 
      
      else if (action === 'delete') {
        // Only managers or admins (the creators) can delete tasks
        if (!isManagerOrAdmin) {
          return next(new AppError(403, 'FORBIDDEN', 'Access denied. Only managers and admins can delete tasks.'));
        }
      } 
      
      else if (action === 'update') {
        // Editing fields like title, description, assignee, priority etc.
        // Restricted to ADMIN and MANAGER.
        if (!isManagerOrAdmin) {
          return next(new AppError(403, 'FORBIDDEN', 'Access denied. Only managers and admins can edit task details.'));
        }
      } 
      
      else if (action === 'update_status') {
        // Card status can change by everyone in the organization
        next();
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = {
  requireRole,
  scopeTaskList,
  requireTaskAccess
};
