import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: 'internal_server_error',
      message: 'Unexpected server error',
    },
  });
};
