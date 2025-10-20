import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, loadOrganization } from '../middleware/auth';
import 'express-async-errors';

const router = Router();

// Public routes
router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.post('/refresh', (req, res) => authController.refresh(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

// Protected routes
router.get('/me', authenticate, loadOrganization, (req, res) => 
  authController.me(req, res)
);

export default router;
