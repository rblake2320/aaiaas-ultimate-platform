import { Request, Response } from 'express';
import { usageService } from '../services/usageService';

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

    const dailyUsage = await usageService.getDailyUsage(
      organizationId,
      metric as string,
      days ? parseInt(days as string) : 30
    );

    res.json({ metric, data: dailyUsage });
  }

  async getUsageByUser(req: any, res: Response) {
    const organizationId = req.organization.id;
    const { metric, startDate, endDate } = req.query;

    if (!metric || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Metric, startDate, and endDate parameters are required',
      });
    }

    const breakdown = await usageService.getUsageByUser(
      organizationId,
      metric as string,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ metric, breakdown });
  }

  async getUsageByApiKey(req: any, res: Response) {
    const organizationId = req.organization.id;
    const { metric, startDate, endDate } = req.query;

    if (!metric || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Metric, startDate, and endDate parameters are required',
      });
    }

    const breakdown = await usageService.getUsageByApiKey(
      organizationId,
      metric as string,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ metric, breakdown });
  }
}

export const usageController = new UsageController();
