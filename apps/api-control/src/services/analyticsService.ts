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
  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardMetrics(organizationId: string): Promise<AnalyticsMetrics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Get current month usage
    const currentMonthRecords = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfMonth, now]);

    const totalApiCalls = currentMonthRecords
      .filter((r) => r.metric === 'api_calls')
      .reduce((sum, r) => sum + r.value, 0);

    const totalTokens = currentMonthRecords
      .filter((r) => r.metric === 'tokens_input' || r.metric === 'tokens_output')
      .reduce((sum, r) => sum + r.value, 0);

    // Get last month for comparison
    const lastMonthRecords = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfLastMonth, endOfLastMonth]);

    const lastMonthApiCalls = lastMonthRecords
      .filter((r) => r.metric === 'api_calls')
      .reduce((sum, r) => sum + r.value, 0);

    const lastMonthTokens = lastMonthRecords
      .filter((r) => r.metric === 'tokens_input' || r.metric === 'tokens_output')
      .reduce((sum, r) => sum + r.value, 0);

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

    // Get top users by usage
    const userUsage = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [startOfMonth, now])
      .whereNotNull('user_id')
      .select('user_id')
      .sum('value as total')
      .groupBy('user_id')
      .orderBy('total', 'desc')
      .limit(5);

    const topUsers = await Promise.all(
      userUsage.map(async (u) => {
        const user = await db('users').where({ id: u.user_id }).first();
        return {
          userId: u.user_id,
          userName: user?.name || 'Unknown',
          apiCalls: parseInt(u.total as string) || 0,
          tokens: 0, // Would calculate separately in production
        };
      })
    );

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

    const recentRecords = await db('usage_records')
      .where({ organization_id: organizationId })
      .whereBetween('recorded_at', [oneHourAgo, now]);

    const apiCallsLastHour = recentRecords
      .filter((r) => r.metric === 'api_calls')
      .reduce((sum, r) => sum + r.value, 0);

    const tokensLastHour = recentRecords
      .filter((r) => r.metric === 'tokens_input' || r.metric === 'tokens_output')
      .reduce((sum, r) => sum + r.value, 0);

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
