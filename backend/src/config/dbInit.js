const { pool } = require('./db');

// SQLite-compliant v4 UUID generator formula
const UUID_FORMULA = "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))";

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('Initializing SQLite database schema...');
    
    // Create Organizations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY DEFAULT ${UUID_FORMULA},
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT ${UUID_FORMULA},
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MANAGER', 'MEMBER')),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Refresh Tokens Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY DEFAULT ${UUID_FORMULA},
        token TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at DATETIME NOT NULL,
        revoked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Projects Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY DEFAULT ${UUID_FORMULA},
        name TEXT NOT NULL,
        description TEXT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (name, organization_id)
      );
    `);

    // Create Tasks Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY DEFAULT ${UUID_FORMULA},
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
        status TEXT DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED')),
        due_date DATETIME,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Task Status History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_status_history (
        id TEXT PRIMARY KEY DEFAULT ${UUID_FORMULA},
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);');
    
    // Performance indexes as required by the assignment
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);');
    
    await client.query('CREATE INDEX IF NOT EXISTS idx_history_task ON task_status_history(task_id);');

    console.log('SQLite database schema successfully initialized.');
  } catch (err) {
    console.error('Error initializing database schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = initializeDatabase;
