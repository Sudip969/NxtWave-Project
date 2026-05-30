const { query } = require('../config/db');
const { AppError } = require('../utils/errors');
const { sseClients } = require('./notificationController'); // We will define this next
const { redisClient, getIsRedisConnected } = require('../config/redis');

const invalidateTaskCache = async (orgId, taskId = null) => {
  if (!getIsRedisConnected()) return;
  try {
    const pattern = `tasks:org:${orgId}:*`;
    const keys = await redisClient.keys(pattern);
    if (keys && keys.length > 0) {
      await redisClient.del(keys);
      console.log(`--- [Redis Cache Invalidation] Cleared ${keys.length} list keys for org: ${orgId} ---`);
    }
    if (taskId) {
      const taskKey = `tasks:task:${taskId}`;
      await redisClient.del(taskKey);
      console.log(`--- [Redis Cache Invalidation] Cleared task key: ${taskKey} ---`);
    }
  } catch (err) {
    console.error('Redis cache invalidation error:', err.message);
  }
};

// Transition State Machine Mapping
const VALID_TRANSITIONS = {
  'TODO': ['IN_PROGRESS', 'BLOCKED'],
  'IN_PROGRESS': ['IN_REVIEW', 'BLOCKED'],
  'IN_REVIEW': ['DONE', 'IN_PROGRESS', 'BLOCKED'],
  'BLOCKED': ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'],
  'DONE': ['TODO', 'IN_PROGRESS'] // ADMIN/MANAGER can reopen
};

const createTask = async (req, res, next) => {
  try {
    const { title, description, priority, dueDate, projectId, assigneeId } = req.body;
    const orgId = req.user.organization_id;
    const creatorId = req.user.id;

    if (!title || !projectId) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Title and projectId are required'));
    }

    // 1. Verify Project belongs to user's Organization
    const projectRes = await query(
      'SELECT id FROM projects WHERE id = $1 AND organization_id = $2',
      [projectId, orgId]
    );
    if (projectRes.rows.length === 0) {
      return next(new AppError(404, 'NOT_FOUND', 'Project not found in your organization'));
    }

    // 2. Validate Assignee belongs to user's Organization
    let finalAssigneeId = null;
    if (assigneeId) {
      const assigneeRes = await query(
        'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
        [assigneeId, orgId]
      );
      if (assigneeRes.rows.length === 0) {
        return next(new AppError(400, 'VALIDATION_ERROR', 'Assignee must belong to your organization'));
      }
      finalAssigneeId = assigneeId;
    }

    // 3. Verify due_date is in the future
    let parsedDueDate = null;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return next(new AppError(400, 'VALIDATION_ERROR', 'due_date must be a valid ISO date string'));
      }
      if (parsedDueDate < new Date()) {
        return next(new AppError(400, 'VALIDATION_ERROR', 'due_date must be a future date'));
      }
    }

    const finalPriority = ['LOW', 'MEDIUM', 'HIGH'].includes(priority) ? priority : 'MEDIUM';

    // 4. Insert Task
    const taskInsert = await query(
      `INSERT INTO tasks (title, description, priority, status, due_date, project_id, assignee_id, creator_id)
       VALUES ($1, $2, $3, 'TODO', $4, $5, $6, $7)
       RETURNING *`,
      [title, description, finalPriority, parsedDueDate, projectId, finalAssigneeId, creatorId]
    );

    const task = taskInsert.rows[0];

    // Log the initial state history
    await query(
      `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by_id)
       VALUES ($1, NULL, 'TODO', $2)`,
      [task.id, creatorId]
    );



    await invalidateTaskCache(orgId);

    res.status(201).json({
      status: 201,
      message: 'Task created successfully',
      data: { task }
    });
  } catch (err) {
    next(err);
  }
};

const getTasks = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    const { page = 1, limit = 10, status, priority, assignee } = req.query;

    const parsedPage = Math.max(1, parseInt(page));
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit)));
    const offset = (parsedPage - 1) * parsedLimit;

    const isRedisActive = getIsRedisConnected();
    const cacheKey = `tasks:org:${orgId}:page:${parsedPage}:limit:${parsedLimit}:status:${status || ''}:priority:${priority || ''}:assignee:${assignee || ''}`;

    if (isRedisActive) {
      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          console.log(`--- [Redis Cache Hit] tasks for org: ${orgId} ---`);
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (err) {
        console.error('Redis cache get error:', err.message);
      }
    }



    // Build raw SQL query parts dynamically
    const queryParams = [orgId];
    let queryIndex = 2;

    let filterSql = '';

    if (status) {
      filterSql += ` AND t.status = $${queryIndex++}`;
      queryParams.push(status);
    }
    if (priority) {
      filterSql += ` AND t.priority = $${queryIndex++}`;
      queryParams.push(priority);
    }
    if (assignee) {
      filterSql += ` AND t.assignee_id = $${queryIndex++}`;
      queryParams.push(assignee);
    }

    // Fetch total count for pagination metadata
    const countRes = await query(
      `SELECT COUNT(t.id) as count 
       FROM tasks t 
       JOIN projects p ON t.project_id = p.id 
       WHERE p.organization_id = $1 ${filterSql}`,
      queryParams
    );
    const totalCount = parseInt(countRes.rows[0].count);

    // Fetch actual tasks
    const tasksRes = await query(
      `SELECT t.*, 
              p.name as project_name, 
              u.name as assignee_name, 
              u.email as assignee_email,
              c.name as creator_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN users c ON t.creator_id = c.id
       WHERE p.organization_id = $1 ${filterSql}
       ORDER BY t.created_at DESC
       LIMIT $${queryIndex++} OFFSET $${queryIndex++}`,
      [...queryParams, parsedLimit, offset]
    );

    const responsePayload = {
      status: 200,
      data: {
        tasks: tasksRes.rows,
        pagination: {
          total: totalCount,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(totalCount / parsedLimit)
        }
      }
    };



    if (isRedisActive) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(responsePayload), {
          EX: 300
        });
        console.log(`--- [Redis Cache Miss / Set] stored tasks for org: ${orgId} ---`);
      } catch (err) {
        console.error('Redis cache set error:', err.message);
      }
    }

    res.status(200).json(responsePayload);
  } catch (err) {
    next(err);
  }
};

const getTaskById = async (req, res, next) => {
  try {
    console.log('--- DEBUG: getTaskById Triggered ---');
    console.log('req.targetTask:', req.targetTask);

    if (!req.targetTask) {
      console.error('ERROR: req.targetTask is undefined!');
      return next(new AppError(500, 'INTERNAL_SERVER_ERROR', 'Task context is missing'));
    }

    const isRedisActive = getIsRedisConnected();
    const taskId = req.params.id;
    const cacheKey = `tasks:task:${taskId}`;

    if (isRedisActive) {
      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          console.log(`--- [Redis Cache Hit] task: ${taskId} ---`);
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (err) {
        console.error('Redis cache get error:', err.message);
      }
    }

    // req.targetTask is pre-populated by requireTaskAccess middleware!
    // We can enrich it with creator and assignee names using a simple query
    const taskRes = await query(
      `SELECT t.*, 
              p.name as project_name, 
              u.name as assignee_name, 
              u.email as assignee_email,
              c.name as creator_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN users c ON t.creator_id = c.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    const responsePayload = {
      status: 200,
      data: { task: taskRes.rows[0] }
    };

    if (isRedisActive) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(responsePayload), {
          EX: 300
        });
        console.log(`--- [Redis Cache Miss / Set] stored task: ${taskId} ---`);
      } catch (err) {
        console.error('Redis cache set error:', err.message);
      }
    }

    res.status(200).json(responsePayload);
  } catch (err) {
    console.error('getTaskById Exception:', err);
    next(err);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const task = req.targetTask; // pre-populated by middleware
    const orgId = req.user.organization_id;
    const isManagerOrAdmin = req.user.role === 'MANAGER' || req.user.role === 'ADMIN';

    const { title, description, priority, status, dueDate, assigneeId } = req.body;

    const originalAssigneeId = task.assignee_id;
    let finalAssigneeId = task.assignee_id;

    // 1. If non-status fields are changing, verify role is ADMIN/MANAGER
    const hasFieldChanges = title !== undefined || description !== undefined || priority !== undefined || dueDate !== undefined || assigneeId !== undefined;
    
    if (hasFieldChanges && !isManagerOrAdmin) {
      return next(new AppError(403, 'FORBIDDEN', 'Access denied. Members can only transition task status.'));
    }

    // 2. Validate new assignee (if changed)
    if (assigneeId !== undefined && assigneeId !== task.assignee_id) {
      if (assigneeId !== null) {
        const assigneeRes = await query(
          'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
          [assigneeId, orgId]
        );
        if (assigneeRes.rows.length === 0) {
          return next(new AppError(400, 'VALIDATION_ERROR', 'Assignee must belong to your organization'));
        }
        finalAssigneeId = assigneeId;
      } else {
        finalAssigneeId = null;
      }
    }

    // 3. Validate due_date (if changed)
    let finalDueDate = task.due_date;
    if (dueDate !== undefined) {
      if (dueDate !== null) {
        const parsedDueDate = new Date(dueDate);
        if (isNaN(parsedDueDate.getTime())) {
          return next(new AppError(400, 'VALIDATION_ERROR', 'due_date must be a valid ISO date string'));
        }
        if (parsedDueDate < new Date()) {
          return next(new AppError(400, 'VALIDATION_ERROR', 'due_date must be a future date'));
        }
        finalDueDate = parsedDueDate;
      } else {
        finalDueDate = null;
      }
    }

    // 4. Validate Status is a valid task state
    let finalStatus = task.status;
    let isStatusChanged = false;

    if (status !== undefined && status !== task.status) {
      const validStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED'];
      if (!validStatuses.includes(status)) {
        return next(new AppError(400, 'VALIDATION_ERROR', `Invalid status: ${status}`));
      }

      finalStatus = status;
      isStatusChanged = true;
    }

    // 5. Build Dynamic SQL UPDATE statement
    const newTitle = title !== undefined ? title : task.title;
    const newDescription = description !== undefined ? description : task.description;
    const newPriority = priority !== undefined ? priority : task.priority;

    const taskUpdate = await query(
      `UPDATE tasks 
       SET title = $1, description = $2, priority = $3, status = $4, due_date = $5, assignee_id = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [newTitle, newDescription, newPriority, finalStatus, finalDueDate, finalAssigneeId, task.id]
    );

    const updatedTask = taskUpdate.rows[0];

    // 6. Record status transition history and send SSE real-time notifications
    if (isStatusChanged) {
      await query(
        `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by_id)
         VALUES ($1, $2, $3, $4)`,
        [task.id, task.status, finalStatus, req.user.id]
      );

      // Trigger SSE notification to the assignee if they are active
      if (finalAssigneeId && sseClients[finalAssigneeId]) {
        const payload = {
          taskId: task.id,
          title: updatedTask.title,
          fromStatus: task.status,
          toStatus: finalStatus,
          changedBy: req.user.name,
          timestamp: new Date()
        };
        sseClients[finalAssigneeId].forEach(client => {
          client.write(`data: ${JSON.stringify(payload)}\n\n`);
        });
        console.log(`SSE Notification emitted to user ${finalAssigneeId} for task ${task.id}`);
      }
    }



    await invalidateTaskCache(orgId, task.id);

    res.status(200).json({
      status: 200,
      message: 'Task updated successfully',
      data: { task: updatedTask }
    });
  } catch (err) {
    next(err);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const task = req.targetTask; // pre-populated by middleware
    const orgId = req.user.organization_id;

    // Delete task from DB
    await query('DELETE FROM tasks WHERE id = $1', [task.id]);



    await invalidateTaskCache(orgId, task.id);

    res.status(200).json({
      status: 200,
      message: 'Task deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask
};
