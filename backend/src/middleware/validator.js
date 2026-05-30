const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Get the first validation error message to keep it clean and compliant
    const firstError = errors.array()[0];
    const message = `${firstError.path || firstError.param}: ${firstError.msg}`;
    return next(new AppError(400, 'VALIDATION_ERROR', message));
  }
  next();
};

module.exports = validate;
