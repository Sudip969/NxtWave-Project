const bcrypt = require('bcryptjs');
const { query, pool } = require('./db');
const initializeDatabase = require('./dbInit');

async function seedDatabase() {
  console.log('Seeding database...');
  try {
    // 1. Ensure tables exist
    await initializeDatabase();

    // 2. Check if we already have users to avoid double seeding
    const usersCount = await query('SELECT COUNT(*) as count FROM users');
    if (parseInt(usersCount.rows[0].count) > 0) {
      console.log('Database already has data. Skipping seed.');
      return;
    }

    console.log('Running DML Seeding...');

    // 3. Create default organization
    const orgRes = await query(
      "INSERT INTO organizations (name) VALUES ('NxtWave Corp') RETURNING id"
    );
    const orgId = orgRes.rows[0].id;

    // 4. Create default ADMIN user
    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('admin123', salt);

    // ADMIN
    await query(
      `INSERT INTO users (email, password_hash, name, role, organization_id)
       VALUES ('admin@nxtwave.com', $1, 'Alice Admin', 'ADMIN', $2)
       RETURNING id`,
      [adminPassword, orgId]
    );

    // No default tasks seeded - starting with clean workspace!
    console.log('Database seeding successfully finished.');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

// Support running directly from CLI
if (require.main === module) {
  seedDatabase().then(() => {
    pool.end();
  });
}

module.exports = seedDatabase;
