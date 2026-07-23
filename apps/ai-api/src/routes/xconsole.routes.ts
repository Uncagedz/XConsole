import { Router } from 'express';
import { leadContextIngestSchema } from '@drivecentric-ai/shared';
import { env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
router.use(requireAuth);

router.post(
  '/context',
  validateBody(leadContextIngestSchema),
  asyncHandler(async (request, response) => {
    if (!env.XCONSOLE_GATEWAY_URL || !env.XCONSOLE_GATEWAY_TOKEN) {
      response.status(503).json({
        ok: false,
        connected: false,
        suggestions: [],
        message: 'XConsole gateway forwarding is not configured',
      });
      return;
    }
    const gatewayResponse = await fetch(
      `${env.XCONSOLE_GATEWAY_URL.replace(/\/+$/, '')}/api/extension/drivecentric/context`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.XCONSOLE_GATEWAY_TOKEN}`,
        },
        body: JSON.stringify(request.body),
      },
    );
    const payload = (await gatewayResponse.json()) as unknown;
    response.status(gatewayResponse.status).json(payload);
  }),
);

export { router as xconsoleRoutes };
