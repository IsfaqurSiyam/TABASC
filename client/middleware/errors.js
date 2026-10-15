class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFoundHandler = (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status)
    ? error.status
    : Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const code = error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message = status >= 500
    ? 'An internal server error occurred'
    : error.message;

  if (status >= 500) {
    console.error(`Request failed with ${code} on ${req.method} ${req.path}`);
  }

  return res.status(status).json({ message, code });
};

module.exports = { AppError, errorHandler, notFoundHandler };
