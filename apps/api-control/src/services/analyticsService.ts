import { db } from '../config/database';
import { logger } from '../utils/logger';

export interface AnalyticsMetrics {
  overview: {
    totalApiCalls: number;
    totalTokens: number;
    totalCost: number;
    activeUsers: number;
    activeWorkflows: number;
  };
  trends: {
    apiCallsTrend: number; // percentage change
    tokensTrend: number;
    costTrend: number;
  };
  topEndpoints: Array<{
    endpoint: string;
    calls: number;
    avgResponseTime: number;
  }>;
  topUsers: Array<{
    userId: string;
    userName: string;
    apiCalls: number;
    tokens: number;
  }>;
  errorRate: {
    total: number;
    rate: number;
    topErrors: Array<{
      error: string;
      count: number;
    }>;
  };
}

export class AnalyticsService {
  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardMetrics(organizationId: string): Promise<AnalyticsMetrics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Aggregate via SQL (avoid loading potentially huge usage_records into memory).
    const currentTotals = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfMonth, now])
      .select('metric')
      .sum({ total: 'value' })
      .groupBy('metric');

    const currentByMetric = new Map<string, number>();
    for (const row of currentTotals as Array<{ metric: string; total: unknown }>) {
      currentByMetric.set(row.metric, this.toNumber(row.total));
    }

    const totalApiCalls = currentByMetric.get('api_calls') ?? 0;
    const totalTokens = (currentByMetric.get('tokens_input') ?? 0) + (currentByMetric.get('tokens_output') ?? 0);

    const lastTotals = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfLastMonth, endOfLastMonth])
      .select('metric')
      .sum({ total: 'value' })
      .groupBy('metric');

    const lastByMetric = new Map<string, number>();
    for (const row of lastTotals as Array<{ metric: string; total: unknown }>) {
      lastByMetric.set(row.metric, this.toNumber(row.total));
    }

    const lastMonthApiCalls = lastByMetric.get('api_calls') ?? 0;
    const lastMonthTokens = (lastByMetric.get('tokens_input') ?? 0) + (lastByMetric.get('tokens_output') ?? 0);

    // Calculate trends
    const apiCallsTrend = lastMonthApiCalls > 0
      ? ((totalApiCalls - lastMonthApiCalls) / lastMonthApiCalls) * 100
      : 0;

    const tokensTrend = lastMonthTokens > 0
      ? ((totalTokens - lastMonthTokens) / lastMonthTokens) * 100
      : 0;

    // Get active users
    const activeUsers = await db('organization_members')
      .where({ organization_id: organizationId })
      .count('* as count')
      .first();

    // Get active workflows
    const activeWorkflows = await db('workflows')
      .where({ organization_id: organizationId, status: 'active' })
      .count('* as count')
      .first();

    // Get top users by API calls without N+1 lookups (join users table).
    const topUsersRows = await db('usage_records as ur')
      .leftJoin('users as u', 'u.id', 'ur.user_id')
      .where({ 'ur.organization_id': organizationId, 'ur.metric': 'api_calls' })
      .whereBetween('ur.recorded_at', [startOfMonth, now])
      .whereNotNull('ur.user_id')
      .select('ur.user_id as userId', db.raw("COALESCE(u.name, 'Unknown') as userName"))
      .sum({ apiCalls: 'ur.value' })
      .groupBy('ur.user_id', 'u.name')
      .orderByRaw('SUM(ur.value) DESC')
      .limit(5);

    const topUsers = (topUsersRows as Array<{ userId: string; userName: string; apiCalls: unknown }>).map((r) => ({
      userId: r.userId,
      userName: r.userName,
      apiCalls: this.toNumber(r.apiCalls),
      tokens: 0, // Would calculate separately in production
    }));

    return {
      overview: {
        totalApiCalls,
        totalTokens,
        totalCost: 0, // Would calculate from usage
        activeUsers: parseInt(activeUsers?.count as string) || 0,
        activeWorkflows: parseInt(activeWorkflows?.count as string) || 0,
      },
      trends: {
        apiCallsTrend,
        tokensTrend,
        costTrend: 0,
      },
      topEndpoints: [], // Would track in production
      topUsers,
      errorRate: {
        total: 0,
        rate: 0,
        topErrors: [],
      },
    };
  }

  /**
   * Get real-time metrics
   */
  async getRealtimeMetrics(organizationId: string): Promise<any> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentTotals = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [oneHourAgo, now])
      .select('metric')
      .sum({ total: 'value' })
      .groupBy('metric');

    const recentByMetric = new Map<string, number>();
    for (const row of recentTotals as Array<{ metric: string; total: unknown }>) {
      recentByMetric.set(row.metric, this.toNumber(row.total));
    }

    const apiCallsLastHour = recentByMetric.get('api_calls') ?? 0;
    const tokensLastHour = (recentByMetric.get('tokens_input') ?? 0) + (recentByMetric.get('tokens_output') ?? 0);

    return {
      apiCallsPerMinute: apiCallsLastHour / 60,
      tokensPerMinute: tokensLastHour / 60,
      timestamp: now,
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(organizationId: string): Promise<any> {
    // In production, track response times, error rates, etc.
    // For now, return mock data
    return {
      avgResponseTime: 250, // ms
      p95ResponseTime: 500,
      p99ResponseTime: 1000,
      successRate: 99.5,
      errorRate: 0.5,
    };
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<any> {
    const records = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startDate, endDate])
      .orderBy('recorded_at', 'asc');

    if (format === 'json') {
      return records;
    }

    // Convert to CSV
    if (records.length === 0) {
      return '';
    }

    const headers = Object.keys(records[0]).join(',');
    const rows = records.map((r) => Object.values(r).join(','));
    return [headers, ...rows].join('\n');
  }
}

export const analyticsService = new AnalyticsService();
