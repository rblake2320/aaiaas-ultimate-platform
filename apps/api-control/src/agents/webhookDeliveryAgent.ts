import crypto from 'crypto';
import axios from 'axios';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import type { AlwaysRunningAgent } from './agent';

function safeStringify(value: any): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {});
}

export class WebhookDeliveryAgent implements AlwaysRunningAgent {
  name = 'webhook-delivery';
  intervalMs = 2000;

  private isTickRunning = false;

  tick = async () => {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const deliveries = await db.transaction(async (trx) => {
        const rows = await trx('webhook_deliveries as d')
          .join('webhooks as w', 'w.id', 'd.webhook_id')
          .whereNull('d.delivered_at')
          .andWhere('w.is_active', true)
          .andWhere('d.attempt_count', '<', 5)
          .orderBy('d.created_at', 'asc')
          .select(
            'd.id',
            'd.webhook_id',
            'd.event_type',
            'd.payload',
            'd.attempt_count',
            'w.url as webhook_url',
            'w.secret as webhook_secret'
          )
          .limit(10)
          .forUpdate()
          .skipLocked();

        if (rows.length === 0) return [];

        // Increment attempt_count immediately to avoid duplicate concurrent sends
        await Promise.all(
          rows.map((r) =>
            trx('webhook_deliveries')
              .where({ id: r.id })
              .update({
                attempt_count: (r.attempt_count ?? 0) + 1,
                updated_at: new Date(),
              })
          )
        );

        return rows;
      });

      for (const d of deliveries) {
        try {
          const payloadBody = safeStringify(d.payload);
          const signature = crypto
            .createHmac('sha256', d.webhook_secret)
            .update(payloadBody)
            .digest('hex');

          const res = await axios.post(d.webhook_url, payloadBody, {
            headers: {
              'Content-Type': 'application/json',
              'X-AAIAAS-Event': d.event_type,
              'X-AAIAAS-Delivery': d.id,
              'X-AAIAAS-Signature': `sha256=${signature}`,
            },
            timeout: 10_000,
            // Let us record non-2xx responses instead of throwing
            validateStatus: () => true,
          });

          const success = res.status >= 200 && res.status < 300;
          await db('webhook_deliveries')
            .where({ id: d.id })
            .update({
              response_status: res.status,
              response_body:
                typeof res.data === 'string'
                  ? res.data.slice(0, 5000)
                  : JSON.stringify(res.data ?? {}).slice(0, 5000),
              delivered_at: success ? new Date() : null,
              updated_at: new Date(),
            });

          if (!success) {
            logger.warn('Webhook delivery failed (non-2xx)', {
              deliveryId: d.id,
              status: res.status,
            });
          }
        } catch (error: any) {
          logger.error('Webhook delivery attempt error', {
            deliveryId: d.id,
            error: error?.message || String(error),
          });

          await db('webhook_deliveries')
            .where({ id: d.id })
            .update({
              response_status: null,
              response_body: (error?.message || String(error)).slice(0, 5000),
              updated_at: new Date(),
            });
        }
      }
    } catch (error: any) {
      logger.error('WebhookDeliveryAgent fatal tick error', { error: error?.message || String(error) });
    } finally {
      this.isTickRunning = false;
    }
  };
}

