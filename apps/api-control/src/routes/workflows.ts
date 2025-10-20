import { Router } from 'express';
import { workflowController } from '../controllers/workflowController';
import { authenticate, loadOrganization } from '../middleware/auth';
import 'express-async-errors';

const router = Router();

// All workflow routes require authentication
router.use(authenticate);
router.use(loadOrganization);

// Workflow CRUD
router.post('/', (req, res) => workflowController.create(req, res));
router.get('/', (req, res) => workflowController.list(req, res));
router.get('/:id', (req, res) => workflowController.get(req, res));
router.put('/:id', (req, res) => workflowController.update(req, res));
router.delete('/:id', (req, res) => workflowController.delete(req, res));

// Workflow execution
router.post('/:id/execute', (req, res) => workflowController.execute(req, res));
router.get('/:id/executions', (req, res) => workflowController.listExecutions(req, res));
router.get('/executions/:executionId', (req, res) => workflowController.getExecution(req, res));

export default router;
