import { Router } from 'express';
import { githubWebhookController } from '../controllers/githubWebhookController';
import 'express-async-errors';

const router = Router();

// GitHub webhooks (no auth; protected by signature when configured)
router.post('/github', (req, res) => githubWebhookController.handle(req, res));

export default router;

