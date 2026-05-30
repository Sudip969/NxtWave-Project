const { AppError } = require('../utils/errors');

module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Log 500 errors for internal auditing
  if (status === 500) {
    console.error('Unhandled System Exception:', err);
  }

  res.status(status).json({
    status,
    code,
    message
  });
};
