import { Router } from 'express';
import { loginRequestSchema, refreshRequestSchema, userBioSchema } from '@drivecentric-ai/shared';
import { AuthService } from '../services/auth.service.js';
import { UserService } from '../services/user.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { unauthorized } from '../lib/errors.js';

const router = Router();
const auth = new AuthService();
const users = new UserService();

router.post(
  '/login',
  validateBody(loginRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await auth.login(req.body, req));
  }),
);

router.post(
  '/refresh',
  validateBody(refreshRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await auth.refresh(req.body, req));
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await auth.me(req.auth));
  }),
);

router.patch(
  '/me/bio',
  requireAuth,
  validateBody(userBioSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await users.updateBio(req.auth, req.body, req));
  }),
);

router.get(
  '/quota',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await auth.quota(req.auth));
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
    res.json(await auth.logout(refreshToken, req));
  }),
);

export { router as authRoutes };
