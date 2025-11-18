import { Request, Response } from 'express';
import { usageService } from '../services/usageService';
import { validateNumericParam, validateDateParam } from '../utils/validation';

export class UsageController {
  async getSummary(req: any, res: Response) {
    const organizationId = req.organization.id;

    const summary = await usageService.getUsageSummary(organizationId);

    res.json(summary);
  }

  async getDailyUsage(req: any, res: Response) {
    const organizationId = req.organization.id;
    const { metric, days } = req.query;

    if (!metric) {
      return res.status(400).json({ error: 'Metric parameter is required' });
    }

    const validatedDays = validateNumericParam(days, 'days', {
      defaultValue: 30,
      min: 1,
      max: 365,
      integer: true,
    });

    const dailyUsage = await usageService.getDailyUsage(
      organizationId,
      metric as string,
      validatedDays
    );

    res.json({ metric, data: dailyUsage });
  }

  async getUsageByUser(req: any, res: Response) {
    const organizationId = req.organization.id;
    const { metric, startDate, endDate } = req.query;

    if (!metric) {
      return res.status(400).json({ error: 'Metric parameter is required' });
    }

    const validatedStartDate = validateDateParam(startDate, 'startDate');
    const validatedEndDate = validateDateParam(endDate, 'endDate', {
      minDate: validatedStartDate,
    });

    const breakdown = await usageService.getUsageByUser(
      organizationId,
      metric as string,
      validatedStartDate,
      validatedEndDate
    );

    res.json({ metric, breakdown });
  }

  async getUsageByApiKey(req: any, res: Response) {
    const organizationId = req.organization.id;
    const { metric, startDate, endDate } = req.query;

    if (!metric) {
      return res.status(400).json({ error: 'Metric parameter is required' });
    }

    const validatedStartDate = validateDateParam(startDate, 'startDate');
    const validatedEndDate = validateDateParam(endDate, 'endDate', {
      minDate: validatedStartDate,
    });

    const breakdown = await usageService.getUsageByApiKey(
      organizationId,
      metric as string,
      validatedStartDate,
      validatedEndDate
    );

    res.json({ metric, breakdown });
  }
}

export const usageController = new UsageController();
