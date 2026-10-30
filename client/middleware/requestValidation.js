const { AppError } = require('./errors');

const validateRequest = (schema) => (req, res, next) => {
  for (const section of ['body', 'params', 'query']) {
    const sectionSchema = schema[section];
    if (!sectionSchema) continue;

    const values = req[section] || {};
    for (const [field, rule] of Object.entries(sectionSchema)) {
      const value = values[field];
      if (rule.required && (value === undefined || value === null || value === '')) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} is required`));
      }
      if (value === undefined || value === null) continue;

      if (rule.type && typeof value !== rule.type) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} must be ${rule.type}`));
      }
      if (rule.enum && !rule.enum.includes(value)) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} has an invalid value`));
      }
      if (typeof value === 'string' && rule.minLength && value.length < rule.minLength) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} is too short`));
      }
      if (typeof value === 'string' && rule.maxLength !== undefined &&
          Buffer.byteLength(value, 'utf8') > rule.maxLength) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} is too long`));
      }
      if (typeof value === 'number' &&
          ((rule.min !== undefined && value < rule.min) ||
           (rule.max !== undefined && value > rule.max))) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} is out of range`));
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} has an invalid format`));
      }
    }
  }
  return next();
};

const validateJsonBody = (req, res, next) => {
  if (req.body === undefined) return next();
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(new AppError(400, 'INVALID_BODY', 'Request body must be a JSON object'));
  }
  return next();
};

module.exports = { validateJsonBody, validateRequest };
