import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { InventoryService } from '../services/inventory.service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const inventory = new InventoryService();

router.use(requireAuth, requirePermission('canUseInventoryLookup'));

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 9), 1), 60);
    res.json(await inventory.search(query, limit));
  }),
);

export { router as inventoryRoutes };
