import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { workflowEngine, WorkflowDefinition } from '../services/workflowService';
import { logger } from '../utils/logger';

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyGitHubSignature(req: any): boolean {
  if (!env.GITHUB_WEBHOOK_SECRET) return true;

  const signatureHeader = (req.headers['x-hub-signature-256'] as string | undefined) || '';
  const rawBody: Buffer | undefined = req.rawBody;
  if (!signatureHeader || !rawBody) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(rawBody).digest('hex');

  return timingSafeEqual(signatureHeader, expected);
}

function extractBranch(ref?: string): string | undefined {
  if (!ref) return undefined;
  const prefix = 'refs/heads/';
  if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  return ref;
}

async function executeTriggeredWorkflow(trigger: any, payload: Record<string, any>) {
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
      logger.error('Git push workflow execution error', {
        workflowId: workflow.id,
        executionId,
        error: error.message,
      });
    });
}

export class GitHubWebhookController {
  async handle(req: Request, res: Response) {
    if (!verifyGitHubSignature(req)) {
      return res.status(401).json({ error: 'Invalid GitHub signature' });
    }

    const event = (req.headers['x-github-event'] as string | undefined) || '';
    if (event !== 'push') {
      return res.status(202).json({ accepted: true, ignored: true });
    }

    const payload: any = req.body || {};
    const repo = payload.repository?.full_name as string | undefined;
    const branch = extractBranch(payload.ref);

    if (!repo) {
      return res.status(400).json({ error: 'Missing repository in payload' });
    }

    const triggers = await db('workflow_triggers')
      .where({ type: 'git_push', is_active: true })
      .andWhere((qb) => {
        qb.whereRaw("NOT (config ? 'repo')").orWhereRaw("config->>'repo' = ?", [repo]);
      })
      .andWhere((qb) => {
        qb.whereRaw("NOT (config ? 'branch')").orWhereRaw("config->>'branch' = ?", [branch || '']);
      })
      .select('id', 'workflow_id', 'organization_id', 'config');

    for (const trigger of triggers) {
      await executeTriggeredWorkflow(trigger, {
        trigger: {
          type: 'git_push',
          repo,
          branch,
        },
        github: {
          repository: repo,
          branch,
          ref: payload.ref,
          after: payload.after,
          before: payload.before,
          pusher: payload.pusher,
          sender: payload.sender,
          commits: payload.commits,
        },
      });
    }

    return res.status(202).json({ accepted: true, triggered: triggers.length });
  }
}

export const githubWebhookController = new GitHubWebhookController();

