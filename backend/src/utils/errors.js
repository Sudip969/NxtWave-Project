class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.message = message;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  AppError
};
