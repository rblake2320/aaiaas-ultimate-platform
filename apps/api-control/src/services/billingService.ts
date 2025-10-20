import { db } from '../config/database';
import { logger } from '../utils/logger';
import { usageService } from './usageService';

export interface BillingPlan {
  id: string;
  name: string;
  price: number;
  features: string[];
  limits: {
    apiCalls?: number;
    tokens?: number;
    workflows?: number;
    teamMembers?: number;
  };
}

export const BILLING_PLANS: Record<string, BillingPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    features: [
      '1,000 API calls/month',
      '100,000 tokens/month',
      '5 workflows',
      '1 team member',
      'Community support',
    ],
    limits: {
      apiCalls: 1000,
      tokens: 100000,
      workflows: 5,
      teamMembers: 1,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29,
    features: [
      '100,000 API calls/month',
      '10M tokens/month',
      'Unlimited workflows',
      '10 team members',
      'Priority support',
      'Advanced analytics',
    ],
    limits: {
      apiCalls: 100000,
      tokens: 10000000,
      teamMembers: 10,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 299,
    features: [
      'Unlimited API calls',
      'Unlimited tokens',
      'Unlimited workflows',
      'Unlimited team members',
      '24/7 dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'On-premise deployment',
    ],
    limits: {},
  },
};

export class BillingService {
  /**
   * Get organization's current plan
   */
  async getCurrentPlan(organizationId: string): Promise<BillingPlan> {
    const subscription = await db('subscriptions')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc')
      .first();

    if (!subscription || subscription.status !== 'active') {
      return BILLING_PLANS.free;
    }

    return BILLING_PLANS[subscription.plan] || BILLING_PLANS.free;
  }

  /**
   * Check if organization has exceeded limits
   */
  async checkLimits(organizationId: string): Promise<{
    exceeded: boolean;
    limits: Record<string, { current: number; limit: number; exceeded: boolean }>;
  }> {
    const plan = await this.getCurrentPlan(organizationId);
    const usage = await usageService.getCurrentMonthUsage(organizationId);

    const limits: Record<string, { current: number; limit: number; exceeded: boolean }> = {};

    if (plan.limits.apiCalls) {
      const current = usage['api_calls'] || 0;
      limits.apiCalls = {
        current,
        limit: plan.limits.apiCalls,
        exceeded: current >= plan.limits.apiCalls,
      };
    }

    if (plan.limits.tokens) {
      const current = (usage['tokens_input'] || 0) + (usage['tokens_output'] || 0);
      limits.tokens = {
        current,
        limit: plan.limits.tokens,
        exceeded: current >= plan.limits.tokens,
      };
    }

    if (plan.limits.workflows) {
      const workflowCount = await db('workflows')
        .where({ organization_id: organizationId })
        .count('* as count')
        .first();
      
      const current = parseInt(workflowCount?.count as string) || 0;
      limits.workflows = {
        current,
        limit: plan.limits.workflows,
        exceeded: current >= plan.limits.workflows,
      };
    }

    if (plan.limits.teamMembers) {
      const memberCount = await db('organization_members')
        .where({ organization_id: organizationId })
        .count('* as count')
        .first();
      
      const current = parseInt(memberCount?.count as string) || 0;
      limits.teamMembers = {
        current,
        limit: plan.limits.teamMembers,
        exceeded: current >= plan.limits.teamMembers,
      };
    }

    const exceeded = Object.values(limits).some((limit) => limit.exceeded);

    return { exceeded, limits };
  }

  /**
   * Create subscription
   */
  async createSubscription(
    organizationId: string,
    plan: string,
    paymentMethodId?: string
  ): Promise<any> {
    const billingPlan = BILLING_PLANS[plan];
    if (!billingPlan) {
      throw new Error('Invalid plan');
    }

    // In production, integrate with Stripe
    // For now, create a local subscription record
    const subscription = await db('subscriptions').insert({
      organization_id: organizationId,
      plan: billingPlan.id,
      status: 'active',
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      price: billingPlan.price,
    }).returning('*');

    logger.info('Subscription created', {
      organizationId,
      plan: billingPlan.id,
    });

    return subscription[0];
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(organizationId: string): Promise<void> {
    await db('subscriptions')
      .where({ organization_id: organizationId, status: 'active' })
      .update({
        status: 'canceled',
        canceled_at: new Date(),
      });

    logger.info('Subscription canceled', { organizationId });
  }

  /**
   * Get billing history
   */
  async getBillingHistory(organizationId: string): Promise<any[]> {
    const subscriptions = await db('subscriptions')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc');

    return subscriptions.map((sub) => ({
      id: sub.id,
      plan: sub.plan,
      status: sub.status,
      price: sub.price,
      periodStart: sub.current_period_start,
      periodEnd: sub.current_period_end,
      createdAt: sub.created_at,
      canceledAt: sub.canceled_at,
    }));
  }

  /**
   * Generate invoice
   */
  async generateInvoice(organizationId: string, month: Date): Promise<any> {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    const usage = await usageService.getUsageStats(
      organizationId,
      'api_calls',
      startOfMonth,
      endOfMonth
    );

    const allUsage = await usageService.getCurrentMonthUsage(organizationId);
    const cost = usageService.calculateCost(allUsage);

    const subscription = await db('subscriptions')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc')
      .first();

    return {
      organizationId,
      period: {
        start: startOfMonth,
        end: endOfMonth,
      },
      subscription: subscription ? {
        plan: subscription.plan,
        basePrice: subscription.price,
      } : null,
      usage: allUsage,
      usageCost: cost,
      totalCost: (subscription?.price || 0) + cost,
      currency: 'USD',
    };
  }
}

export const billingService = new BillingService();
