import { Router } from 'express';
import { createUserRequestSchema, updateUserRequestSchema } from '@drivecentric-ai/shared';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { UserService } from '../services/user.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { unauthorized } from '../lib/errors.js';

const router = Router();
const users = new UserService();

router.use(requireAuth, requireRole('owner'), requirePermission('canManageUsers'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await users.listUsers(req.auth));
  }),
);

router.post(
  '/',
  validateBody(createUserRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.status(201).json(await users.createUser(req.auth, req.body, req));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await users.getUser(req.auth, req.params.id!));
  }),
);

router.patch(
  '/:id',
  validateBody(updateUserRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await users.updateUser(req.auth, req.params.id!, req.body, req));
  }),
);

export { router as usersRoutes };
