import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { workflowEngine, WorkflowDefinition } from '../services/workflowService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(['trigger', 'action', 'condition', 'transform']),
    config: z.record(z.any()),
    next: z.array(z.string()).optional(),
  })),
  variables: z.record(z.any()).optional(),
});

const executeWorkflowSchema = z.object({
  input: z.record(z.any()).optional(),
});

export class WorkflowController {
  async create(req: any, res: Response) {
    const input = workflowSchema.parse(req.body);
    const userId = req.user.id;
    const organizationId = req.organization.id;

    const workflowId = uuidv4();

    await db('workflows').insert({
      id: workflowId,
      organization_id: organizationId,
      created_by: userId,
      name: input.name,
      description: input.description,
      definition: JSON.stringify({
        nodes: input.nodes,
        variables: input.variables,
      }),
      status: 'active',
    });

    const workflow = await db('workflows').where({ id: workflowId }).first();

    logger.info('Workflow created', { workflowId, organizationId });

    res.status(201).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      createdAt: workflow.created_at,
    });
  }

  async list(req: any, res: Response) {
    const organizationId = req.organization.id;

    const workflows = await db('workflows')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc');

    res.json({
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  }

  async get(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;

    const workflow = await db('workflows')
      .where({ id, organization_id: organizationId })
      .first();

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      definition: JSON.parse(workflow.definition),
      status: workflow.status,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    });
  }

  async update(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;
    const input = workflowSchema.partial().parse(req.body);

    const workflow = await db('workflows')
      .where({ id, organization_id: organizationId })
      .first();

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const updates: any = {
      updated_at: new Date(),
    };

    if (input.name) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.nodes || input.variables) {
      const currentDef = JSON.parse(workflow.definition);
      updates.definition = JSON.stringify({
        nodes: input.nodes || currentDef.nodes,
        variables: input.variables || currentDef.variables,
      });
    }

    await db('workflows').where({ id }).update(updates);

    const updated = await db('workflows').where({ id }).first();

    logger.info('Workflow updated', { workflowId: id, organizationId });

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      updatedAt: updated.updated_at,
    });
  }

  async delete(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;

    const workflow = await db('workflows')
      .where({ id, organization_id: organizationId })
      .first();

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await db('workflows').where({ id }).delete();

    logger.info('Workflow deleted', { workflowId: id, organizationId });

    res.json({ message: 'Workflow deleted successfully' });
  }

  async execute(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;
    const userId = req.user.id;
    const input = executeWorkflowSchema.parse(req.body);

    const workflow = await db('workflows')
      .where({ id, organization_id: organizationId })
      .first();

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (workflow.status !== 'active') {
      return res.status(400).json({ error: 'Workflow is not active' });
    }

    const definition: WorkflowDefinition = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      ...JSON.parse(workflow.definition),
    };

    const executionId = uuidv4();

    const mode = (process.env.WORKFLOW_EXECUTION_MODE || 'inline').toLowerCase();

    if (mode === 'queued') {
      // Enqueue workflow run for the always-running workflow runner agent
      await db('workflow_runs').insert({
        id: executionId,
        workflow_id: definition.id,
        organization_id: organizationId,
        user_id: userId,
        status: 'pending',
        input: input.input ?? {},
        created_at: new Date(),
        updated_at: new Date(),
      });
    } else {
      // Execute workflow asynchronously in-process (dev-friendly default)
      workflowEngine
        .executeWorkflow(
          definition,
          {
            executionId,
            organizationId,
            userId,
            variables: {},
          },
          input.input,
          { createRunRecord: true }
        )
        .catch((error) => {
          logger.error('Workflow execution error', {
            workflowId: id,
            executionId,
            error: error.message,
          });
        });
    }

    logger.info('Workflow execution started', { workflowId: id, executionId });

    res.status(202).json({
      executionId,
      status: mode === 'queued' ? 'pending' : 'running',
      message: mode === 'queued' ? 'Workflow execution queued' : 'Workflow execution started',
    });
  }

  async getExecution(req: any, res: Response) {
    const { executionId } = req.params;
    const organizationId = req.organization.id;

    const execution = await db('workflow_runs')
      .where({ id: executionId, organization_id: organizationId })
      .first();

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const safeJson = (value: any) => {
      if (value == null) return null;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    };

    res.json({
      id: execution.id,
      workflowId: execution.workflow_id,
      status: execution.status,
      input: safeJson(execution.input),
      output: safeJson(execution.output),
      error: execution.error_message,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
    });
  }

  async listExecutions(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;

    const executions = await db('workflow_runs')
      .where({ workflow_id: id, organization_id: organizationId })
      .orderBy('started_at', 'desc')
      .limit(50);

    res.json({
      executions: executions.map((e) => ({
        id: e.id,
        status: e.status,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        error: e.error_message,
      })),
    });
  }
}

export const workflowController = new WorkflowController();
