const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '../../tasktracker.db');
const db = new sqlite3.Database(dbPath);

// Enable foreign key constraints
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON;', (err) => {
    if (err) {
      console.error('Failed to enable foreign keys in SQLite:', err.message);
    } else {
      console.log('SQLite foreign key constraints enabled.');
    }
  });
});

const query = (text, params = []) => {
  return new Promise((resolve, reject) => {
    // Dynamically convert Postgres placeholders ($1, $2, etc.) to SQLite placeholders (?)
    const sqliteText = text.replace(/\$\d+/g, '?');

    db.all(sqliteText, params, (err, rows) => {
      if (err) {
        console.error('Database query error:', err.message, 'Query:', sqliteText, 'Params:', params);
        return reject(err);
      }
      resolve({ rows: rows || [] });
    });
  });
};

module.exports = {
  query,
  pool: {
    // Provide a mocked pool object for seeding CLI script or tests
    connect: async () => ({
      query: (text, params = []) => query(text, params),
      release: () => {}
    }),
    end: () => {
      db.close((err) => {
        if (err) {
          console.error('Error closing SQLite database:', err.message);
        } else {
          console.log('SQLite database closed.');
        }
      });
    }
  }
};

