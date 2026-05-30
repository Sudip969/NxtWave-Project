const express = require('express');
const cors = require('cors');
require('dotenv').config();

const initializeDatabase = require('./config/dbInit');
const seedDatabase = require('./config/seed');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// API Health Check Ping
app.get('/ping', (req, res) => {
  res.status(200).json({ status: 200, message: 'Team Task Tracker REST API is operational' });
});

// Modular Routes Registration
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);

// Catch 404 Route Errors
app.use((req, res, next) => {
  const { AppError } = require('./utils/errors');
  next(new AppError(404, 'NOT_FOUND', `Route ${req.originalUrl} not found`));
});

// Global Error Handler Middleware
app.use(errorHandler);

// Database Auto-Initialization & Bootstrap Seeding
async function startServer() {
  try {
    // 1. Initialise tables & indices
    await initializeDatabase();
    
    // 2. Run seed script if DB is empty
    await seedDatabase();

    // 3. Start Listening
    app.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`  Express Server running on port ${PORT}`);
      console.log(`  Endpoint health check at: http://localhost:${PORT}/ping`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.error('Fatal: Server failed to start due to database error:', err);
    process.exit(1);
  }
}

// Support Jest tests by exporting app without starting server
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
