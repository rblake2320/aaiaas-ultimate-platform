import { Router } from 'express';
import { apiKeyController } from '../controllers/apiKeyController';
import { usageController } from '../controllers/usageController';
import { authenticate, loadOrganization } from '../middleware/auth';
import 'express-async-errors';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(loadOrganization);

// API Key management
router.post('/', (req, res) => apiKeyController.create(req, res));
router.get('/', (req, res) => apiKeyController.list(req, res));

// Usage tracking routes - MUST come before /:id to prevent route collision
// (otherwise /usage would be interpreted as an id parameter)
router.get('/usage/summary', (req, res) => usageController.getSummary(req, res));
router.get('/usage/daily', (req, res) => usageController.getDailyUsage(req, res));
router.get('/usage/by-user', (req, res) => usageController.getUsageByUser(req, res));
router.get('/usage/by-key', (req, res) => usageController.getUsageByApiKey(req, res));

// ID-based routes - MUST come after specific routes like /usage/*
router.get('/:id', (req, res) => apiKeyController.get(req, res));
router.put('/:id', (req, res) => apiKeyController.update(req, res));
router.post('/:id/revoke', (req, res) => apiKeyController.revoke(req, res));
router.delete('/:id', (req, res) => apiKeyController.delete(req, res));

export default router;

