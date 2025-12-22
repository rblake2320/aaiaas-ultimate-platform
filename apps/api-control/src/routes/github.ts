import { Router } from 'express';
import 'express-async-errors';
import { authenticate } from '../middleware/auth';
import { githubController } from '../controllers/githubController';

const router = Router();

// All GitHub routes require control-plane authentication (JWT/ApiKey)
router.use(authenticate);

// List all repos for the GitHub user associated with the provided token
router.get('/repos', (req, res) => githubController.listRepos(req as any, res));

export default router;
