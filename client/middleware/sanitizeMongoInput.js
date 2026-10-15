const { AppError } = require('./errors');

const assertSafeKeys = (value) => {
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') ||
        key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new AppError(400, 'INVALID_INPUT', 'MongoDB operator keys are not allowed');
    }
    assertSafeKeys(child);
  }
};

const sanitizeMongoInput = (req, res, next) => {
  try {
    assertSafeKeys(req.body);
    assertSafeKeys(req.params);
    assertSafeKeys(req.query);
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = sanitizeMongoInput;
