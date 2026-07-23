import { Router } from 'express';
import {
  billingAmountSchema,
  billingRechargeRequestSchema,
  billingSetBalanceRequestSchema,
  billingTransferRequestSchema,
  roleSchema,
} from '@drivecentric-ai/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { unauthorized } from '../lib/errors.js';
import { asyncHandler } from '../utils/async-handler.js';
import { BillingService } from '../services/billing.service.js';

const router = Router();
const billing = new BillingService();

router.use(requireAuth);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(await billing.status(req.auth));
  }),
);

router.post(
  '/quote',
  validateBody(billingAmountSchema.extend({ role: roleSchema.optional() })),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json(billing.quote(req.body.amountDollars, req.body.role ?? req.auth.role));
  }),
);

router.post(
  '/recharge',
  requireRole('owner'),
  validateBody(billingRechargeRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.status(201).json(await billing.recharge(req.auth, req.body, req));
  }),
);

router.post(
  '/set-balance',
  requireRole('owner'),
  validateBody(billingSetBalanceRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.status(201).json(await billing.setBalance(req.auth, req.body, req));
  }),
);

router.post(
  '/transfer',
  requireRole('owner'),
  validateBody(billingTransferRequestSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.status(201).json(await billing.transfer(req.auth, req.body, req));
  }),
);

export { router as billingRoutes };
