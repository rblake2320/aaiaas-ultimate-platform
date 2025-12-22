import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { workflowEngine, WorkflowDefinition } from '../services/workflowService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('every_5m') }),
  z.object({ type: z.literal('hourly') }),
  z.object({
    type: z.literal('git_push'),
    repo: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
  }),
]);

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
  trigger: triggerSchema.optional(),
});

const executeWorkflowSchema = z.object({
  input: z.record(z.any()).optional(),
});

function ceilToMinuteStep(date: Date, stepMinutes: number): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  const remainder = minutes % stepMinutes;
  if (remainder !== 0) {
    d.setMinutes(minutes + (stepMinutes - remainder));
  }
  // Ensure it's strictly in the future
  if (d.getTime() <= date.getTime()) {
    d.setMinutes(d.getMinutes() + stepMinutes);
  }
  return d;
}

function nextTopOfHour(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

async function upsertWorkflowTrigger(params: {
  workflowId: string;
  organizationId: string;
  trigger: z.infer<typeof triggerSchema>;
}) {
  const now = new Date();
  const { workflowId, organizationId, trigger } = params;

  if (trigger.type === 'manual') {
    await db('workflow_triggers').where({ workflow_id: workflowId }).delete();
    return;
  }

  let row: any;
  if (trigger.type === 'every_5m') {
    row = {
      workflow_id: workflowId,
      organization_id: organizationId,
      type: 'interval',
      interval_minutes: 5,
      config: {},
      is_active: true,
      next_trigger_at: ceilToMinuteStep(now, 5),
      updated_at: now,
    };
  } else if (trigger.type === 'hourly') {
    row = {
      workflow_id: workflowId,
      organization_id: organizationId,
      type: 'hourly',
      interval_minutes: null,
      config: {},
      is_active: true,
      next_trigger_at: nextTopOfHour(now),
      updated_at: now,
    };
  } else {
    row = {
      workflow_id: workflowId,
      organization_id: organizationId,
      type: 'git_push',
      interval_minutes: null,
      config: {
        ...(trigger.repo ? { repo: trigger.repo } : {}),
        ...(trigger.branch ? { branch: trigger.branch } : {}),
      },
      is_active: true,
      next_trigger_at: null,
      updated_at: now,
    };
  }

  const existing = await db('workflow_triggers').where({ workflow_id: workflowId }).first();
  if (existing) {
    await db('workflow_triggers').where({ workflow_id: workflowId }).update(row);
  } else {
    await db('workflow_triggers').insert({
      id: uuidv4(),
      created_at: now,
      ...row,
    });
  }
}

function toTriggerResponse(triggerRow: any) {
  if (!triggerRow) return { type: 'manual' as const };
  if (triggerRow.type === 'hourly') return { type: 'hourly' as const, isActive: triggerRow.is_active };
  if (triggerRow.type === 'interval' && triggerRow.interval_minutes === 5) {
    return { type: 'every_5m' as const, isActive: triggerRow.is_active };
  }
  if (triggerRow.type === 'git_push') {
    return {
      type: 'git_push' as const,
      isActive: triggerRow.is_active,
      repo: triggerRow.config?.repo,
      branch: triggerRow.config?.branch,
    };
  }
  return { type: 'manual' as const };
}

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
      definition: {
        nodes: input.nodes,
        variables: input.variables,
      },
      status: 'active',
    });

    if (input.trigger) {
      await upsertWorkflowTrigger({ workflowId, organizationId, trigger: input.trigger });
    }

    const workflow = await db('workflows').where({ id: workflowId }).first();
    const trigger = await db('workflow_triggers').where({ workflow_id: workflowId }).first();

    logger.info('Workflow created', { workflowId, organizationId });

    res.status(201).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      trigger: toTriggerResponse(trigger),
      createdAt: workflow.created_at,
    });
  }

  async list(req: any, res: Response) {
    const organizationId = req.organization.id;

    const workflows = await db('workflows as w')
      .leftJoin('workflow_triggers as t', 't.workflow_id', 'w.id')
      .where({ 'w.organization_id': organizationId })
      .orderBy('w.created_at', 'desc')
      .select(
        'w.id',
        'w.name',
        'w.description',
        'w.status',
        'w.created_at',
        'w.updated_at',
        't.type as trigger_type',
        't.interval_minutes as trigger_interval_minutes',
        't.config as trigger_config',
        't.is_active as trigger_is_active'
      );

    res.json({
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        trigger: toTriggerResponse({
          type: w.trigger_type,
          interval_minutes: w.trigger_interval_minutes,
          config: w.trigger_config,
          is_active: w.trigger_is_active,
        }),
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

    const trigger = await db('workflow_triggers').where({ workflow_id: id }).first();

    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      definition: workflow.definition,
      status: workflow.status,
      trigger: toTriggerResponse(trigger),
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
      const currentDef = workflow.definition || {};
      updates.definition = {
        nodes: input.nodes || currentDef.nodes,
        variables: input.variables || currentDef.variables,
      };
    }

    await db('workflows').where({ id }).update(updates);

    if (input.trigger) {
      await upsertWorkflowTrigger({ workflowId: id, organizationId, trigger: input.trigger });
    }

    const updated = await db('workflows').where({ id }).first();
    const trigger = await db('workflow_triggers').where({ workflow_id: id }).first();

    logger.info('Workflow updated', { workflowId: id, organizationId });

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      trigger: toTriggerResponse(trigger),
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
      ...(workflow.definition || {}),
    };

    const executionId = uuidv4();

    // Execute workflow asynchronously
    workflowEngine
      .executeWorkflow(definition, {
        executionId,
        organizationId,
        variables: {},
      }, input.input)
      .catch((error) => {
        logger.error('Workflow execution error', {
          workflowId: id,
          executionId,
          error: error.message,
        });
      });

    logger.info('Workflow execution started', { workflowId: id, executionId });

    res.status(202).json({
      executionId,
      status: 'running',
      message: 'Workflow execution started',
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

    res.json({
      id: execution.id,
      workflowId: execution.workflow_id,
      status: execution.status,
      input: execution.input ?? null,
      output: execution.output ?? null,
      error: execution.error_message ?? null,
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
        error: e.error_message ?? null,
      })),
    });
  }
}

export const workflowController = new WorkflowController();
