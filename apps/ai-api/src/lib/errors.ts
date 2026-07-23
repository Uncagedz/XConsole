export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new ApiError(401, 'unauthorized', message);

export const forbidden = (message = 'Insufficient permissions') =>
  new ApiError(403, 'forbidden', message);

export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);

export const conflict = (message = 'Conflict') => new ApiError(409, 'conflict', message);

export const aiGenerationFailed = (details?: unknown) =>
  new ApiError(502, 'ai_generation_failed', 'AI generation failed. Check OpenAI API key / backend logs.', details);
