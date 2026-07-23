import { Router } from 'express';
import { aiFeedbackRequestSchema, aiGenerateRequestSchema } from '@drivecentric-ai/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AiService } from '../services/ai.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { unauthorized } from '../lib/errors.js';

const router = Router();
const ai = new AiService();

router.use(requireAuth);

router.post(
  '/generate',
  validateBody(aiGenerateRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await ai.generate(req.body, req.auth));
  }),
);

router.post(
  '/feedback',
  validateBody(aiFeedbackRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await ai.recordFeedback(req.body, req.auth));
  }),
);

export { router as aiRoutes };
