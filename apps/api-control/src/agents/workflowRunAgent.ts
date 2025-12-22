import { db } from '../config/database';
import { workflowEngine, WorkflowDefinition } from '../services/workflowService';
import { logger } from '../utils/logger';
import type { AlwaysRunningAgent } from './agent';

function parseMaybeJson<T>(value: any): T {
  if (value == null) return value as T;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

export class WorkflowRunAgent implements AlwaysRunningAgent {
  name = 'workflow-runner';
  intervalMs = 1000;

  private isTickRunning = false;

  tick = async () => {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const claimedRuns = await db.transaction(async (trx) => {
        const runs = await trx('workflow_runs')
          .where({ status: 'pending' })
          .orderBy('created_at', 'asc')
          .limit(5)
          .forUpdate()
          .skipLocked();

        if (runs.length === 0) return [];

        const now = new Date();
        await Promise.all(
          runs.map((r) =>
            trx('workflow_runs').where({ id: r.id }).update({
              status: 'running',
              started_at: now,
              updated_at: now,
            })
          )
        );

        return runs;
      });

      for (const run of claimedRuns) {
        try {
          const workflowRow = await db('workflows').where({ id: run.workflow_id }).first();
          if (!workflowRow) {
            await db('workflow_runs')
              .where({ id: run.id })
              .update({
                status: 'failed',
                error_message: `Workflow not found: ${run.workflow_id}`,
                completed_at: new Date(),
                updated_at: new Date(),
              });
            continue;
          }

          const definition = parseMaybeJson<{ nodes: any[]; variables?: Record<string, any> }>(
            workflowRow.definition
          );

          const workflow: WorkflowDefinition = {
            id: workflowRow.id,
            name: workflowRow.name,
            description: workflowRow.description,
            nodes: definition.nodes,
            variables: definition.variables,
          };

          const input = parseMaybeJson<Record<string, any>>(run.input) ?? {};

          await workflowEngine.executeWorkflow(
            workflow,
            {
              executionId: run.id,
              organizationId: run.organization_id,
              userId: run.user_id,
              variables: {},
            },
            input,
            { createRunRecord: false }
          );
        } catch (error: any) {
          // executeWorkflow already marks the run failed; this is just to keep the agent alive
          logger.error('WorkflowRunAgent tick error', {
            executionId: run.id,
            workflowId: run.workflow_id,
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      logger.error('WorkflowRunAgent fatal tick error', { error: error?.message || String(error) });
    } finally {
      this.isTickRunning = false;
    }
  };
}

