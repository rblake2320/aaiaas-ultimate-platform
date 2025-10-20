import { db } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface UsageRecord {
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
  metric: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface UsageStats {
  metric: string;
  total: number;
  period: string;
  breakdown?: Record<string, number>;
}

export class UsageService {
  /**
   * Record usage
   */
  async recordUsage(record: UsageRecord): Promise<void> {
    try {
      await db('usage_records').insert({
        id: uuidv4(),
        organization_id: record.organizationId,
        user_id: record.userId,
        api_key_id: record.apiKeyId,
        metric: record.metric,
        value: record.value,
        metadata: record.metadata ? JSON.stringify(record.metadata) : null,
        recorded_at: new Date(),
      });
    } catch (error: any) {
      logger.error('Failed to record usage', {
        error: error.message,
        organizationId: record.organizationId,
        metric: record.metric,
      });
    }
  }

  /**
   * Get usage statistics for an organization
   */
  async getUsageStats(
    organizationId: string,
    metric: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageStats> {
    const records = await db('usage_records')
      .where({ organization_id: organizationId, metric })
      .whereBetween('recorded_at', [startDate, endDate]);

    const total = records.reduce((sum, record) => sum + record.value, 0);

    return {
      metric,
      total,
      period: `${startDate.toISOString()} to ${endDate.toISOString()}`,
    };
  }

  /**
   * Get usage breakdown by user
   */
  async getUsageByUser(
    organizationId: string,
    metric: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const records = await db('usage_records')
      .where({ organization_id: organizationId, metric })
      .whereBetween('recorded_at', [startDate, endDate])
      .whereNotNull('user_id');

    const breakdown: Record<string, number> = {};

    for (const record of records) {
      if (record.user_id) {
        breakdown[record.user_id] = (breakdown[record.user_id] || 0) + record.value;
      }
    }

    return breakdown;
  }

  /**
   * Get usage breakdown by API key
   */
  async getUsageByApiKey(
    organizationId: string,
    metric: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const records = await db('usage_records')
      .where({ organization_id: organizationId, metric })
      .whereBetween('recorded_at', [startDate, endDate])
      .whereNotNull('api_key_id');

    const breakdown: Record<string, number> = {};

    for (const record of records) {
      if (record.api_key_id) {
        breakdown[record.api_key_id] = (breakdown[record.api_key_id] || 0) + record.value;
      }
    }

    return breakdown;
  }

  /**
   * Get current month usage
   */
  async getCurrentMonthUsage(organizationId: string): Promise<Record<string, number>> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const records = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfMonth, endOfMonth]);

    const usage: Record<string, number> = {};

    for (const record of records) {
      usage[record.metric] = (usage[record.metric] || 0) + record.value;
    }

    return usage;
  }

  /**
   * Calculate cost based on usage
   */
  calculateCost(usage: Record<string, number>): number {
    // Pricing per metric (in cents)
    const pricing: Record<string, number> = {
      'api_calls': 0.01,
      'tokens_input': 0.0001,
      'tokens_output': 0.0002,
      'embeddings': 0.00001,
      'storage_gb': 10,
    };

    let totalCost = 0;

    for (const [metric, value] of Object.entries(usage)) {
      const price = pricing[metric] || 0;
      totalCost += value * price;
    }

    return totalCost / 100; // Convert cents to dollars
  }

  /**
   * Get usage summary for dashboard
   */
  async getUsageSummary(organizationId: string): Promise<any> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const currentMonthUsage = await this.getCurrentMonthUsage(organizationId);
    const estimatedCost = this.calculateCost(currentMonthUsage);

    // Get previous month for comparison
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const lastMonthRecords = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfLastMonth, endOfLastMonth]);

    const lastMonthUsage: Record<string, number> = {};
    for (const record of lastMonthRecords) {
      lastMonthUsage[record.metric] = (lastMonthUsage[record.metric] || 0) + record.value;
    }

    const lastMonthCost = this.calculateCost(lastMonthUsage);

    return {
      currentMonth: {
        usage: currentMonthUsage,
        cost: estimatedCost,
        period: {
          start: startOfMonth,
          end: endOfMonth,
        },
      },
      lastMonth: {
        usage: lastMonthUsage,
        cost: lastMonthCost,
        period: {
          start: startOfLastMonth,
          end: endOfLastMonth,
        },
      },
      comparison: {
        costChange: estimatedCost - lastMonthCost,
        costChangePercent: lastMonthCost > 0
          ? ((estimatedCost - lastMonthCost) / lastMonthCost) * 100
          : 0,
      },
    };
  }

  /**
   * Get daily usage for charts
   */
  async getDailyUsage(
    organizationId: string,
    metric: string,
    days: number = 30
  ): Promise<Array<{ date: string; value: number }>> {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const records = await db('usage_records')
      .where({ organization_id: organizationId, metric })
      .whereBetween('recorded_at', [startDate, now])
      .orderBy('recorded_at', 'asc');

    // Group by date
    const dailyUsage: Record<string, number> = {};

    for (const record of records) {
      const date = new Date(record.recorded_at).toISOString().split('T')[0];
      dailyUsage[date] = (dailyUsage[date] || 0) + record.value;
    }

    // Fill in missing dates with 0
    const result: Array<{ date: string; value: number }> = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        value: dailyUsage[dateStr] || 0,
      });
    }

    return result;
  }
}

export const usageService = new UsageService();
