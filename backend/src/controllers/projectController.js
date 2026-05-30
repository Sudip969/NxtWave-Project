const { query } = require('../config/db');
const { AppError } = require('../utils/errors');

const createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const orgId = req.user.organization_id;

    if (!name) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Project name is required'));
    }

    // Check duplicate project name within the same organization
    const nameCheck = await query(
      'SELECT id FROM projects WHERE name = $1 AND organization_id = $2',
      [name, orgId]
    );

    if (nameCheck.rows.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'A project with this name already exists in your organization'));
    }

    const projectInsert = await query(
      `INSERT INTO projects (name, description, organization_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, organization_id, created_at`,
      [name, description, orgId]
    );

    res.status(201).json({
      status: 201,
      message: 'Project created successfully',
      data: { project: projectInsert.rows[0] }
    });
  } catch (err) {
    next(err);
  }
};

const getProjects = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;

    const projectsRes = await query(
      'SELECT id, name, description, created_at FROM projects WHERE organization_id = $1 ORDER BY name ASC',
      [orgId]
    );

    res.status(200).json({
      status: 200,
      data: { projects: projectsRes.rows }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createProject,
  getProjects
};
