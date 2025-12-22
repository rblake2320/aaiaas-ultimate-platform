import { db } from '../config/database';
import { logger } from '../utils/logger';
import { workflowEngine, WorkflowDefinition } from './workflowService';
import { v4 as uuidv4 } from 'uuid';

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

function computeNextTriggerAt(trigger: any, from: Date): Date | null {
  if (trigger.type === 'hourly') return nextTopOfHour(from);
  if (trigger.type === 'interval') {
    const minutes = Number(trigger.interval_minutes) || 0;
    if (minutes <= 0) return null;
    return ceilToMinuteStep(from, minutes);
  }
  return null;
}

async function executeWorkflowForTrigger(trigger: any, payload: Record<string, any>) {
  const workflow = await db('workflows')
    .where({
      id: trigger.workflow_id,
      organization_id: trigger.organization_id,
      status: 'active',
    })
    .first();

  if (!workflow) return;

  const definition: WorkflowDefinition = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    ...(workflow.definition || {}),
  };

  const executionId = uuidv4();
  workflowEngine
    .executeWorkflow(
      definition,
      {
        executionId,
        organizationId: trigger.organization_id,
        variables: {},
      },
      payload
    )
    .catch((error) => {
      logger.error('Scheduled workflow execution error', {
        workflowId: workflow.id,
        executionId,
        error: error.message,
      });
    });
}

async function runDueSchedulesOnce() {
  const now = new Date();

  const due = await db('workflow_triggers')
    .whereIn('type', ['interval', 'hourly'])
    .andWhere({ is_active: true })
    .andWhere('next_trigger_at', '<=', now)
    .select('id', 'workflow_id', 'organization_id', 'type', 'interval_minutes', 'config', 'next_trigger_at');

  for (const trigger of due) {
    const next = computeNextTriggerAt(trigger, now);
    if (!next) continue;

    // Claim trigger atomically to avoid double-firing in multi-instance deployments
    const updated = await db('workflow_triggers')
      .where({ id: trigger.id })
      .andWhere('next_trigger_at', '<=', now)
      .update({
        last_triggered_at: now,
        next_trigger_at: next,
        updated_at: now,
      });

    if (updated === 0) continue;

    await executeWorkflowForTrigger(trigger, {
      trigger: {
        type: trigger.type,
        intervalMinutes: trigger.interval_minutes,
      },
    });
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startWorkflowScheduler(pollMs: number) {
  if (schedulerTimer) return;

  const safePollMs = Number.isFinite(pollMs) && pollMs > 1000 ? pollMs : 30000;

  schedulerTimer = setInterval(() => {
    runDueSchedulesOnce().catch((error) => {
      logger.error('Workflow scheduler tick failed', { error: error.message });
    });
  }, safePollMs);

  // Don’t keep the process alive solely for the scheduler
  schedulerTimer.unref();

  logger.info('Workflow scheduler started', { pollMs: safePollMs });
}

export function stopWorkflowScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

